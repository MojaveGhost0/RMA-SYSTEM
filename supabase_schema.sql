-- Ejecuta este script en el SQL Editor de tu proyecto de Supabase

-- Crear tabla rmas
CREATE TABLE rmas (
    id TEXT PRIMARY KEY,
    estado TEXT,
    clientenombre TEXT,
    clienteid TEXT,
    telefono TEXT,
    producto TEXT,
    referencia TEXT,
    factura TEXT,
    fechafactura TEXT,
    fecharecepcion TEXT,
    operador TEXT,
    tipogestion TEXT,
    fallo TEXT,
    sede TEXT,
    respuesta TEXT
);

-- Crear tabla trazabilidad
CREATE TABLE trazabilidad (
    id SERIAL PRIMARY KEY,
    rma_id TEXT REFERENCES rmas(id) ON DELETE CASCADE,
    estado TEXT,
    fecha TEXT,
    nota TEXT
);

-- Habilitar actualizaciones en tiempo real para ambas tablas
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;
ALTER PUBLICATION supabase_realtime ADD TABLE rmas;
ALTER PUBLICATION supabase_realtime ADD TABLE trazabilidad;
