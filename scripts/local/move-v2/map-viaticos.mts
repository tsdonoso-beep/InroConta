// Old → v2 for viáticos (006_viaticos.sql): people, memos with their annex, expenses, mobility,
// settlement, payments and returns. The old ids are kept, so every reference between them holds.
// The requests (solicitudes_memo) become memos in their first states, as 006 designs them.
//
// The login does not move: usuario.auth_id points to the NEW project's accounts, which do not
// exist yet; the old one stays in auth_id_anterior (012) to link them when the login is set up.
import { COMPANY, date, docKey, fileId, int, num, text, type Notes, type Row } from './helpers.mts';
import type { Taxpayers } from './map-core.mts';
import type { OldData } from './source.mts';
import { withoutRefusedMemos } from './refused-memos.mts';

const REQUEST: Record<string, string> = { PENDIENTE: 'SOLICITADO', APROBADA: 'POR_EMITIR', RECHAZADA: 'RECHAZADO', RETIRADA: 'RETIRADO' };
const positive = (v: unknown) => (num(v) !== null && num(v)! > 0 ? num(v) : null);

export function viaticos(old: OldData, people: Taxpayers, ccIds: Map<string, string>, docIds: Map<string, string>, notes: Notes) {
    const area = old.areas.map((a) => ({ id: a.id, nombre: a.nombre, responsable_id: a.responsable_id ?? null, creado_en: a.creado_en }));
    const usuario = old.usuarios.map((u) => ({
        id: u.id,
        auth_id: null,
        auth_id_anterior: u.auth_id ?? null,
        dni: u.dni,
        dni_provisional: !!u.dni_provisional,
        nombre: u.nombre,
        email: text(u.email),
        cargo: text(u.cargo),
        area_id: u.area_id ?? null,
        jefatura_id: u.jefatura_id ?? null,
        activo: u.activo !== false,
        creado_en: u.creado_en,
    }));
    const email = new Map(old.usuarios.map((u) => [String(u.id), text(u.email)]));
    const usuario_rol = old.roles_usuario.map((r) => ({ usuario_id: r.usuario_id, rol: r.rol }));
    const usuario_banco = old.datos_bancarios.map((b) => {
        const cci = String(b.cci ?? '').replace(/\D/g, '');
        if (b.cci && cci.length !== 20) notes.keep('usuario_banco: CCI que no tiene 20 dígitos (queda vacío)', 'datos_bancarios', b);
        return {
            usuario_id: b.usuario_id,
            banco: b.banco,
            cuenta: b.cuenta,
            cci: cci.length === 20 ? cci : null,
            actualizado_por: b.actualizado_por ?? null,
            actualizado_en: b.actualizado_en,
        };
    });
    // A parameter still undefined (null) keeps v2's seed: valor is jsonb not null there.
    const parametro = old.parametros
        .filter((p) => p.valor !== null)
        .map((p) => ({
            clave: p.clave,
            valor: p.valor,
            descripcion: text(p.descripcion),
            actualizado_por: p.actualizado_por ?? null,
            actualizado_en: p.actualizado_en,
        }));
    const caja_chica = old.cajas_chicas.map((c) => ({
        id: c.id,
        empresa_ruc: COMPANY,
        codigo: c.codigo,
        nombre: c.nombre,
        responsable_id: c.responsable_id,
        activa: c.activa !== false,
        creado_en: c.creado_en,
    }));

    const memos = new Map<string, Row>();
    for (const m of old.memos) {
        const cc = ccIds.get(String(m.centro_costo_id));
        if (!cc) notes.add('memo: centro de costo que no está (se rechazará)');
        memos.set(String(m.id), {
            id: m.id,
            correlativo: m.correlativo,
            tipo: m.tipo,
            estado: m.estado,
            empresa_ruc: COMPANY,
            centro_costo_id: cc ?? m.centro_costo_id,
            destino: text(m.destino),
            motivo: null,
            fecha_salida: date(m.fecha_salida),
            fecha_retorno_prev: date(m.fecha_retorno_prev),
            monto_autorizado: num(m.monto_autorizado) ?? 0,
            moneda: m.moneda ?? 'PEN',
            observacion: text(m.observacion_actual),
            caja_chica_id: m.caja_id ?? null,
            ciclo: text(m.ciclo),
            // memo_referido_id meant two things: the previous cycle of a petty cash, or the viático a PASAJES comes from.
            ciclo_anterior_id: m.tipo === 'CAJA_CHICA' ? (m.memo_referido_id ?? null) : null,
            memo_padre_id: m.tipo !== 'CAJA_CHICA' ? (m.memo_referido_id ?? null) : null,
            creado_por: m.creado_por,
            creado_en: m.creado_en,
            emitido_en: null,
            presentado_en: m.presentado_en ?? null,
            aprobado_por: m.aprobado_por ?? null,
            aprobado_en: m.aprobado_en ?? null,
            contabilizado_en: m.contabilizado_en ?? null,
        });
    }
    const persona = new Map<string, Row>();
    for (const a of old.memo_asignados)
        persona.set(`${a.memo_id}|${a.usuario_id}`, {
            memo_id: a.memo_id,
            usuario_id: a.usuario_id,
            monto: positive(a.monto),
            fecha_desde: date(a.fecha_desde),
            fecha_hasta: date(a.fecha_hasta),
            descripcion: text(a.descripcion),
        });

    // The request: the memo it became, or a memo of its own in SOLICITADO… (without correlativo).
    for (const s of old.solicitudes_memo ?? []) {
        const fields = {
            solicitante_id: s.solicitante_id,
            jefatura_id: s.jefatura_id ?? null,
            respuesta: text(s.respuesta),
            respondido_por: s.respondido_por ?? null,
            respondido_en: s.respondido_en ?? null,
        };
        const made = s.memo_id ? memos.get(String(s.memo_id)) : undefined;
        if (made) {
            Object.assign(made, fields, { motivo: made.motivo ?? text(s.motivo) });
            continue;
        }
        memos.set(String(s.id), {
            id: s.id,
            correlativo: null,
            tipo: s.tipo,
            estado: REQUEST[s.estado] ?? 'SOLICITADO',
            empresa_ruc: COMPANY,
            centro_costo_id: ccIds.get(String(s.centro_costo_id)) ?? s.centro_costo_id,
            destino: text(s.destino),
            motivo: text(s.motivo),
            fecha_salida: date(s.fecha_desde),
            fecha_retorno_prev: date(s.fecha_hasta),
            monto_autorizado: num(s.monto_estimado) ?? 0,
            moneda: 'PEN',
            creado_por: s.solicitante_id,
            creado_en: s.creado_en,
            ...fields,
        });
    }
    for (const p of old.solicitud_personas ?? []) {
        const s = (old.solicitudes_memo ?? []).find((x) => x.id === p.solicitud_id);
        const memoId = s?.memo_id && memos.has(String(s.memo_id)) ? s.memo_id : p.solicitud_id;
        if (!persona.has(`${memoId}|${p.usuario_id}`))
            persona.set(`${memoId}|${p.usuario_id}`, {
                memo_id: memoId,
                usuario_id: p.usuario_id,
                monto: positive(p.monto),
                fecha_desde: date(p.fecha_desde),
                fecha_hasta: date(p.fecha_hasta),
                descripcion: null,
            });
    }

    const memo_correlativo = old.memo_secuencias.map((s) => ({ empresa_ruc: COMPANY, anio: int(s.anio), tipo: s.tipo, ultimo: int(s.ultimo) ?? 0 }));
    const memo_autorizacion = old.autorizaciones_memo.map((a) => ({
        id: a.id,
        memo_id: a.memo_id,
        jefe_id: a.jefe_id,
        solicitada_por: a.solicitada_por,
        monto: num(a.monto),
        motivo: a.motivo,
        estado: a.estado,
        respuesta: text(a.respuesta),
        resuelta_en: a.resuelta_en ?? null,
        creado_en: a.creado_en,
    }));
    const planilla_movilidad = old.planillas_movilidad.map((p) => ({
        id: p.id,
        numero: text(p.numero),
        usuario_id: p.usuario_id,
        memo_id: p.memo_id ?? null,
        periodo: int(p.periodo),
        fecha_emision: date(p.fecha_emision),
        autorizado_por: p.autorizado_por ?? null,
        autorizado_en: p.autorizado_en ?? null,
        creado_por: p.creado_por ?? null,
        creado_en: p.creado_en,
    }));
    const gasto = old.gastos.map((g) => {
        const ruc = people.see(g.proveedor_ruc, g.proveedor_nombre);
        const tipo = /^\d{2}$/.test(String(g.tipo_comprobante ?? '')) ? g.tipo_comprobante : null;
        const comprobante_id = ruc && tipo && g.serie && g.numero ? (docIds.get(docKey(ruc, tipo, g.serie, g.numero)) ?? null) : null;
        return {
            id: g.id,
            client_id: g.client_id,
            memo_id: g.memo_id ?? null,
            usuario_id: g.usuario_id,
            estado: g.estado,
            clase: g.clase ?? 'COMPROBANTE',
            proveedor_ruc: ruc,
            proveedor_nombre: text(g.proveedor_nombre),
            tipo,
            serie: text(g.serie),
            numero: text(g.numero),
            fecha_emision: date(g.fecha_emision),
            moneda: g.moneda ?? 'PEN',
            tipo_cambio: num(g.tipo_cambio),
            subtotal: num(g.subtotal),
            igv: num(g.igv),
            total: num(g.total),
            forma_pago: text(g.forma_pago),
            detalle: text(g.detalle),
            adquiriente_ruc: text(g.adquiriente_ruc),
            comprobante_id,
            motivo: text(g.mov_motivo) ?? text(g.dj_motivo),
            destino: text(g.mov_destino) ?? text(g.dj_lugar),
            planilla_movilidad_id: g.planilla_movilidad_id ?? null,
            confianza_extraccion: g.confianza_extraccion ?? null,
            alertas: g.alertas ?? [],
            alertas_confirmadas: !!g.alertas_confirmadas,
            hash_imagen: text(g.hash_imagen),
            observacion: text(g.observacion),
            drive_id: fileId(g.drive_url),
            drive_error: text(g.drive_error),
            capturado_en: g.capturado_en ?? null,
            creado_en: g.creado_en,
            actualizado_en: g.sincronizado_en ?? g.creado_en,
            storage_key: text(g.storage_key),
            drive_url: text(g.drive_url),
            sincronizado_en: g.sincronizado_en ?? null,
        };
    });
    const liquidacion = old.liquidaciones.map((l) => ({
        id: l.id,
        usuario_id: l.usuario_id,
        estado: l.estado,
        emitida_por: l.emitida_por,
        emitida_en: l.emitida_en,
        referencia: text(l.referencia),
        pagada_por: l.pagada_por ?? null,
        pagada_en: l.pagada_en ?? null,
        observacion: text(l.observacion),
    }));
    const owner = new Map(old.liquidaciones.map((l) => [String(l.id), l]));
    const liquidacion_memo = old.liquidacion_memos.map((x) => ({
        liquidacion_id: x.liquidacion_id,
        memo_id: x.memo_id,
        usuario_id: owner.get(String(x.liquidacion_id))?.usuario_id,
        autorizado: num(x.autorizado) ?? 0,
        rendido: num(x.rendido) ?? 0,
        vigente: owner.get(String(x.liquidacion_id))?.estado !== 'ANULADA',
    }));
    const pago = old.pagos.map((p) => ({
        id: p.id,
        memo_id: p.memo_id,
        banco: p.banco,
        planilla: text(p.planilla),
        fecha: date(p.fecha),
        drive_id: fileId(p.archivo_url),
        registrado_por: p.registrado_por ?? null,
        registrado_en: p.registrado_en,
    }));
    const pago_linea = old.pago_lineas.map((l) => ({
        pago_id: l.pago_id,
        usuario_id: l.usuario_id,
        monto: num(l.monto),
        procesada: l.procesada !== false,
        motivo: text(l.motivo),
    }));
    const devolucion = old.devoluciones.map((d) => ({
        id: d.id,
        memo_id: d.memo_id,
        usuario_id: d.usuario_id,
        monto: num(d.monto),
        operacion: text(d.operacion),
        fecha: date(d.fecha),
        drive_id: fileId(d.imagen_url),
        nota: text(d.nota),
        registrado_por: d.registrado_por ?? null,
        registrado_en: d.registrado_en,
    }));
    // eventos → cambio (who did it: their email, as the app will write it).
    const cambio = old.eventos.map((e) => ({
        entidad: String(e.entidad).toLowerCase(),
        clave: String(e.entidad_id),
        tipo: e.accion,
        campo: null,
        antes: null,
        despues: null,
        detalle: { antes: e.datos_antes, despues: e.datos_despues, usuario_id: e.usuario_id, mudanza: `eventos:${e.id}` },
        hecho_por: email.get(String(e.usuario_id)) ?? null,
        corrida_id: null,
        ocurrido_en: e.ocurrido_en,
    }));

    return withoutRefusedMemos(
        {
            area_base: area.map((a) => ({ ...a, responsable_id: null })),
            area,
            usuario,
            usuario_rol,
            usuario_banco,
            parametro,
            caja_chica,
            memo: [...memos.values()],
            memo_persona: [...persona.values()],
            memo_correlativo,
            memo_autorizacion,
            planilla_movilidad,
            gasto,
            liquidacion,
            liquidacion_memo,
            pago,
            pago_linea,
            devolucion,
            cambio,
        },
        notes,
    );
}
