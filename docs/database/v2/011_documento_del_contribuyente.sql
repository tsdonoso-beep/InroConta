-- ════════════════════════════════════════════════════════════════
-- 011 · EL DOCUMENTO DEL CONTRIBUYENTE
--
-- La ficha de la Consulta RUC trae el documento de la persona natural
-- («DNI 43762331») y la app lo muestra en la ficha SUNAT
-- (src/app/(app)/_ruc/sunat-ficha.tsx). La base vieja lo tenía en
-- padron_ruc.documento; contribuyente (002) no tenía dónde guardarlo.
-- Lo escribe quien guarda la ficha (upsert de sus columnas), con ficha_en.
--
-- Se puede correr dos veces.
-- ════════════════════════════════════════════════════════════════

alter table contribuyente add column if not exists documento text;   -- DNI 43762331

notify pgrst, 'reload schema';
