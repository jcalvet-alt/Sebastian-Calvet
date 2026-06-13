# DroneMap — Prescripción Variable para Mavic 3 Multispectral

## Instalación

```bash
pip install -r requirements.txt
python app.py
```

Abrir en el navegador: http://localhost:5050

## Modos de uso

### Modo 1: Ortomosaico ya procesado (recomendado)
1. Procesar las fotos en DJI Terra o Pix4D → exportar como GeoTIFF
2. Subir el GeoTIFF desde la app
3. La app calcula los índices y detecta malezas

**Formatos aceptados:**
- Un solo GeoTIFF multiespectral de 5 bandas (orden DJI Terra: B, G, R, RE, NIR)
- Cinco archivos GeoTIFF separados por banda (los archivos deben contener en el nombre: blue/green/red/rededge/nir)

### Modo 2: Fotos crudas del drone (requiere WebODM)
1. Tener WebODM corriendo (Docker)
2. Subir las fotos crudas desde la app
3. La app las envía a WebODM, espera el resultado y lo procesa

**Instalación WebODM:**
```bash
git clone https://github.com/OpenDroneMap/WebODM
cd WebODM
./webodm.sh start
```
URL por defecto: http://localhost:8000

## Índices calculados

| Índice | Fórmula | Uso |
|--------|---------|-----|
| NDVI | (NIR-R)/(NIR+R) | Vigor general de vegetación |
| NDRE | (NIR-RE)/(NIR+RE) | Clorofila, más sensible que NDVI |
| GNDVI | (NIR-G)/(NIR+G) | Dosel denso |
| SAVI | (NIR-R)/(NIR+R+L)*(1+L) | Corrección suelo |
| EVI | 2.5*(NIR-R)/(NIR+6R-7.5B+1) | Alta densidad |
| CIre | (NIR/RE)-1 | Contenido clorofila |

## Formatos de prescripción

| Formato | Compatible con |
|---------|---------------|
| Shapefile | Todos los monitores del mercado |
| ISO-XML (ISOBUS) | John Deere, AGCO, CNH, Trimble, Topcon, Raven |
| John Deere RX | Operations Center |
| KMZ | Google Earth, Trimble AgGPS |
| GeoJSON | QGIS, ArcGIS, cualquier GIS |

## Algoritmos de detección

### Estadístico (recomendado)
Detecta píxeles cuyo índice NDVI/NDRE está significativamente por debajo
de la media del lote (N desvíos estándar). Robusto ante variabilidad
normal dentro del cultivo.

### Umbral fijo
Todos los píxeles con NDVI < umbral = maleza. Útil cuando se conoce
el valor de corte para el cultivo específico.

## Configuración sugerida por cultivo

| Cultivo | Índice | Método | Factor std |
|---------|--------|--------|-----------|
| Soja | NDRE | Estadístico | 1.5 |
| Maíz | NDVI | Estadístico | 1.5 |
| Trigo | NDRE | Estadístico | 2.0 |
| Girasol | NDVI | Umbral fijo | 0.30 |
