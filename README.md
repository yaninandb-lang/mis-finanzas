# Mis Finanzas

App web instalable (PWA) para cargar gastos e ingresos desde el celular, también sin conexión.
Los datos se guardan en el teléfono y se sincronizan con una planilla privada de Google Sheets.

Este repositorio contiene sólo el código. **No contiene datos personales**: los movimientos, cuentas y
presupuestos viven en la planilla de Google del usuario, y la clave de sincronización queda guardada
únicamente en el teléfono.

## Qué hace

- Carga rápida por categoría, con medio de pago (efectivo, bancos, billeteras, FCI, tarjetas), moneda (pesos o dólares) y concepto.
- Transferencias entre cuentas: suscribir o rescatar del FCI, pagar el resumen de la tarjeta, comprar dólares.
- Gastos fijos e ingresos previstos que aparecen como pendientes para confirmar.
- Saldos por cuenta con ajuste al saldo real (y registro del rendimiento de las inversiones).
- Panel con disponible, invertido, dólares, deuda de tarjetas, gastos por categoría contra presupuesto, evolución de 6 meses y próximos vencimientos.

## Puesta en marcha

1. Crear una planilla en Google Sheets.
2. Extensiones > Apps Script: pegar el contenido de `apps-script/Code.gs` y guardar.
3. Ejecutar la función `setup` (pide permisos la primera vez) y copiar la clave que aparece en el registro de ejecución.
4. Implementar > Nueva implementación > tipo **Aplicación web**: ejecutar como "Yo", acceso "Cualquier usuario". Copiar la URL.
5. Abrir la app en el celular, entrar a Ajustes (engranaje) y pegar la URL y la clave.
6. En Chrome para Android: menú > "Agregar a la pantalla principal" / "Instalar app".

## Estructura de la planilla

| Hoja | Contenido |
|---|---|
| Movimientos | Gastos, ingresos, transferencias y ajustes |
| Cuentas | Efectivo, bancos, billeteras, inversiones y tarjetas |
| Categorias | Categorías de gasto e ingreso con presupuesto mensual |
| Fijos | Gastos fijos e ingresos previstos (día, meses, vigencia) |
| Config | Cotización del dólar y otros parámetros |
