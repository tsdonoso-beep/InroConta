// One folder opened, from the v2 tables: the folder with its OC and everything that hangs from it
// in ONE request (the foreign keys let PostgREST embed them), plus the two change logs. Before,
// detalle_de_carpeta recalculated vinculos_oc and evidencias_de_fuentes for the whole company on
// every folder opened (~2 s).
import 'server-only';
import { err, ok, type Result } from 'neverthrow';
import { clavesDeArchivo } from '../../../shared/lib/drive/legajo-carpeta.ts';
import type { SourceError } from '../../../shared/errors.ts';
import { one } from '../../../shared/supabase/tables.ts';
import type { FolderDetail } from '../domain/entities/FolderDetail.ts';
import { comexEvidence, costCentreSource, documentsText, warehouseEvidence, type Voucher } from '../domain/policies/evidence.ts';
import { STATUS } from './folder-list.ts';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));
const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;
const fileUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;
const PROC = (v: unknown) => (v === 'IMPORTACION' ? 'Importación' : 'Nacional');
/** How the invoice was tied to the OC, in the old vinculos_oc words: the evidence and which walk saw the file. */
function evidenceLabel(evidencia: unknown, file: Row | null, isImport: boolean): string | null {
    if (evidencia === 'LECTURA') return 'Lectura del documento';
    if (evidencia === 'MANUAL') return 'Unida a mano';
    // Seen by both walks, the legajo wins (it knows more of the OC), as vinculos_oc ordered them.
    const where = file?.visto_legajo_en ? 'Legajo' : file?.visto_carpeta_en ? (isImport ? 'Carpeta de importaciones' : 'Carpeta de compras nacionales') : null;
    if (evidencia === 'NUMERO') return where && where !== 'Legajo' ? `${where} (número sin serie)` : 'Nombre del archivo (número sin serie)';
    if (evidencia === 'NOMBRE')
        return where === 'Legajo' ? 'Legajo (nombre o lectura del archivo)' : where ? `${where} (nombre del archivo)` : 'Nombre del archivo';
    return null;
}

const OC =
    'id,codigo,tipo,procedencia,comprador,comprador_segun,area,situacion_pago,estatus,estado_aprobacion,fecha_oc,monto,monto_pen,moneda,' +
    'forma_pago,condicion_pago,proveedor_ruc,legajo_en,compras_en,comex_en,elaborado,solicitado,requerimiento,concepto,items,incoterm,' +
    'lugar_entrega,comex_estado,comex_origen,modalidad,operador,eta,ata,llegada_planta,llegada_planta_prevista,agente_aduanas,dam,costeo,' +
    'comex_observaciones,centro_costo_segun,centro_costo:centro_costo_id(codigo,nombre),orden_compra_dua(dua,fecha,subio_oc),' +
    'vale_almacen(vale,fecha_operacion,fecha_registro,movimiento,operacion,tipo_documento,numero_documento,proveedor,items,cantidad,recepcionado,responsable,documento_url,documento_ruta),' +
    'carpeta_oc(drive_id,nombre,proyecto_carpeta,visto_carpeta_en),' +
    'comprobante_oc(evidencia,archivo:archivo_id(drive_id,nombre,carpeta_id,visto_carpeta_en,visto_legajo_en),comprobante:comprobante_id(serie,numero,emisor_ruc,tipo))';

export async function readFolderDetail(companyRuc: string, folderId: string): Promise<Result<FolderDetail | null, SourceError>> {
    const [found, files] = await Promise.all([
        one<Row>('carpeta_oc (detalle)', (c) =>
            c.from('carpeta_oc').select(`*,orden_compra(${OC})`).eq('empresa_ruc', companyRuc).eq('drive_id', folderId).limit(1),
        ),
        one<Row>('archivo (detalle)', (c) =>
            c
                .from('archivo')
                .select('drive_id,nombre,parece,serie_en_nombre,leido_serie,leido_claves')
                .eq('carpeta_id', folderId)
                .not('visto_carpeta_en', 'is', null)
                .order('nombre')
                .limit(1000),
        ),
    ]);
    if (found.isErr()) return err(found.error);
    if (files.isErr()) return err(files.error);
    const k = found.value[0];
    if (!k) return ok(null);
    const o = (k.orden_compra ?? {}) as Row;
    const isImport = k.procedencia === 'IMPORTACION';

    const [changes, sourceChanges, copy] = await Promise.all([
        one<Row>('cambio (carpeta)', (c) =>
            c
                .from('cambio')
                .select('tipo,despues,ocurrido_en')
                .eq('entidad', 'carpeta_oc')
                .eq('clave', folderId)
                .order('ocurrido_en', { ascending: false })
                .order('id', { ascending: false })
                .limit(20),
        ),
        o.codigo
            ? one<Row>('cambio (fuentes)', (c) =>
                  c
                      .from('cambio')
                      .select('campo,antes,despues,detalle,ocurrido_en')
                      .in('entidad', ['orden_compra', 'vale_almacen'])
                      .eq('clave', `${k.procedencia}|${o.codigo}`)
                      .order('ocurrido_en', { ascending: false })
                      .order('id', { ascending: false })
                      .limit(30),
              )
            : Promise.resolve(ok([] as Row[])),
        one<Row>('corrida (copia)', (c) =>
            c.from('corrida').select('terminada_en').eq('job', 'copia-fuentes').order('terminada_en', { ascending: false, nullsFirst: false }).limit(1),
        ),
    ]);
    if (changes.isErr()) return err(changes.error);

    const ocFolders = ((o.carpeta_oc as Row[] | null) ?? []).filter((x) => x.visto_carpeta_en);
    const onlyFolder = ocFolders.length <= 1;
    const vouchers = ((o.vale_almacen as Row[] | null) ?? [])
        .slice()
        .sort(
            (a, z) =>
                String(a.fecha_operacion ?? a.fecha_registro).localeCompare(String(z.fecha_operacion ?? z.fecha_registro)) ||
                String(a.vale).localeCompare(String(z.vale)),
        );
    const duas = ((o.orden_compra_dua as Row[] | null) ?? []) as { dua: string; fecha: string | null; subio_oc: boolean | null }[];
    const guide = warehouseEvidence(vouchers as unknown as Voucher[]);
    const evidence = [...(guide ? [guide] : []), ...comexEvidence(s(o.dam), duas, s(o.costeo))];
    const cc = o.centro_costo as Row | null;

    const invoices = new Map<string, FolderDetail['facturas'][number]>();
    for (const l of (o.comprobante_oc as Row[] | null) ?? []) {
        const a = l.archivo as Row | null;
        if (!onlyFolder && a?.carpeta_id !== folderId) continue;
        const d = l.comprobante as Row;
        const key = `${d.serie}-${d.numero}|${d.emisor_ruc}`;
        invoices.set(key, {
            comprobante: `${d.serie}-${d.numero}`,
            ruc: String(d.emisor_ruc),
            tipo: String(d.tipo),
            fuente: evidenceLabel(l.evidencia, a, isImport),
            archivo: s(a?.nombre),
            archivo_url: a?.drive_id ? fileUrl(String(a.drive_id)) : null,
        });
    }

    return ok({
        carpeta: {
            oc: String(o.codigo ?? ''),
            tipo: String(k.tipo ?? o.tipo ?? ''),
            procedencia: PROC(k.procedencia),
            proveedor: s(k.proveedor),
            proyecto: s(k.proyecto_carpeta)?.trim() ?? null,
            nombre: String(k.nombre),
            url: folderUrl(folderId),
            estado: STATUS(k.estado),
            le_falta: ((k.le_falta as string[] | null) ?? []).join(', '),
            documentos: documentsText(k.documentos as Record<string, number> | null, !isImport) || null,
            cc_codigo: s(cc?.codigo),
            cc_nombre: s(cc?.nombre),
            cc_segun: costCentreSource(s(o.centro_costo_segun), isImport),
            leida: s(k.visto_carpeta_en),
        },
        archivos: files.value.map((a) => ({
            nombre: String(a.nombre),
            url: fileUrl(String(a.drive_id)),
            parece: s(a.parece),
            serie: s(a.leido_serie ?? a.serie_en_nombre),
            docs: clavesDeArchivo(String(a.parece ?? ''), (a.leido_claves as string[] | null) ?? []).sort(),
        })),
        legajo: o.legajo_en
            ? {
                  comprador: o.comprador_segun === 'LEGAJO' ? s(o.comprador) : null,
                  area: s(o.area),
                  situacion_pago: s(o.situacion_pago),
                  estatus: s(o.estatus),
                  // dd/mm/yyyy, as the approvals table writes it (the screen shows it as it comes).
                  estado_aprobacion: s(o.estado_aprobacion),
                  fecha_oc: o.fecha_oc ? String(o.fecha_oc).split('-').reverse().join('/') : null,
                  monto_soles: n(o.monto_pen),
                  forma_pago: s(o.forma_pago),
              }
            : null,
        facturas: [...invoices.values()],
        cambios: changes.value.map((c) => ({ fecha: String(c.ocurrido_en), tipo: String(c.tipo), detalle: s(c.despues) })),
        otras: ocFolders
            .filter((x) => x.drive_id !== folderId)
            .map((x) => ({ nombre: String(x.nombre), proyecto: s(x.proyecto_carpeta)?.trim() ?? null, url: folderUrl(String(x.drive_id)) })),
        fuentes: {
            compras: o.compras_en
                ? {
                      fecha: s(o.fecha_oc),
                      elaborado: s(o.elaborado),
                      solicitado: s(o.solicitado),
                      requerimiento: s(o.requerimiento),
                      moneda: s(o.moneda),
                      total: n(o.monto),
                      total_soles: n(o.monto_pen),
                      forma_pago: s(o.forma_pago),
                      condicion_pago: s(o.condicion_pago),
                      concepto: s(o.concepto),
                      // v2 keeps COMEX's country of origin; the Compras base's «país» column was not moved.
                      items: n(o.items),
                      pais: s(o.comex_origen),
                      incoterm: s(o.incoterm),
                      proveedor_ruc: s(o.proveedor_ruc),
                      lugar_entrega: s(o.lugar_entrega),
                  }
                : null,
            comex: o.comex_en
                ? {
                      estado_compra: s(o.comex_estado),
                      comprador: o.comprador_segun === 'COMEX' ? s(o.comprador) : null,
                      modalidad: s(o.modalidad),
                      operador: s(o.operador),
                      eta: s(o.eta),
                      ata: s(o.ata),
                      fecha_real_planta: s(o.llegada_planta),
                      fecha_aprox_planta: s(o.llegada_planta_prevista),
                      agente_aduanas: s(o.agente_aduanas),
                      dam: s(o.dam),
                      costeo: s(o.costeo),
                      observaciones: s(o.comex_observaciones),
                      duas: duas.map((d) => ({ dua: d.dua, fecha: d.fecha, subio_oc: d.subio_oc == null ? null : d.subio_oc ? 'SI' : 'NO' })),
                  }
                : null,
            almacen: vouchers.map((v) => ({
                vale: String(v.vale ?? ''),
                fecha: s(v.fecha_operacion ?? v.fecha_registro),
                registrado: s(v.fecha_registro),
                movimiento: String(v.movimiento ?? ''),
                tipo_documento: s(v.tipo_documento),
                numero_documento: s(v.numero_documento),
                items: n(v.items),
                cantidad: n(v.cantidad),
                recepcionado: s(v.recepcionado),
                operacion: s(v.operacion),
                proveedor: s(v.proveedor),
                responsable: s(v.responsable),
                documento_url: s(v.documento_url),
                tiene_escaneo: !!v.documento_ruta,
            })),
            por_subir: evidence.map((e) => ({ doc: e.doc, evidencia: e.evidencia, enlace: e.enlace })),
            cambios: sourceChanges.unwrapOr([]).map((c) => ({
                fecha: String(c.ocurrido_en),
                fuente: String((c.detalle as Row | null)?.fuente ?? ''),
                campo: String(c.campo ?? ''),
                antes: s(c.antes),
                despues: s(c.despues),
            })),
            copia: s(copy.unwrapOr([])[0]?.terminada_en),
        },
    });
}
