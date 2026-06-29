# Conteo de Hacienda — Dron DJI Mavic 3M

App web para contar bovinos en fotos aéreas. Corre **100% local**, sin subir nada a internet.

---

## Requisitos previos

- Python 3.10 o superior  
- pip  
- ~500 MB de espacio libre (modelo + dependencias)

---

## Instalación paso a paso

### 1. Clonar o descargar el proyecto

```bash
git clone <URL-del-repo>
cd Sebastian-Calvet
```

### 2. Crear entorno virtual (recomendado)

```bash
python -m venv .venv

# Windows:
.venv\Scripts\activate

# Linux / Mac:
source .venv/bin/activate
```

### 3. Instalar dependencias

```bash
pip install -r backend/requirements.txt
```

Esto instala FastAPI, ONNX Runtime, Ultralytics, OpenCV y todo lo necesario.

### 4. Descargar el modelo placeholder

```bash
python scripts/download_placeholder.py
```

Esto descarga YOLOv8n (entrenado en COCO, clase "vaca") y lo convierte a ONNX.
Solo se necesita hacer esto **una vez**.

> **Nota**: el modelo placeholder detecta vacas en fotos de nivel de suelo,
> no desde dron. Funcionará de forma muy imprecisa hasta que entrenes tu
> propio modelo (Etapa 2).

### 5. Arrancar el backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

Vas a ver algo como:

```
INFO | detector | Modelo cargado. Tensor de entrada: images
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### 6. Abrir el frontend

Abrí tu navegador y andá a:

```
http://localhost:8000
```

O abrí directamente el archivo `frontend/index.html` en el navegador.

---

## Cómo usar la app

1. **Arrastrá** una foto (JPG/PNG/TIFF) al área gris, o hacé clic para seleccionarla.
2. Ajustá el **umbral de confianza** (si detecta poco, bajalo; si detecta demasiado, subilo).
3. Hacé clic en **Detectar**.
4. El número grande muestra el conteo. Las cajas verdes son animales detectados.
5. Para corregir:
   - Seleccioná **+ Agregar** y hacé clic donde hay un animal no detectado.
   - Seleccioná **− Quitar** y hacé clic sobre una caja errónea.
   - O editá el número directamente en el campo "Corregir total".
6. Hacé clic en **Exportar JSON** para guardar el resultado.

---

## Estructura del proyecto

```
Sebastian-Calvet/
├── backend/
│   ├── main.py          # Servidor FastAPI
│   ├── detector.py      # Lógica de tiling + NMS + inferencia ONNX
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── models/
│   ├── yolov8n_coco.onnx   # Placeholder (se descarga con el script)
│   └── cattle.onnx         # Tu modelo entrenado (Etapa 2)
├── data/
│   └── samples/            # Fotos de prueba
├── scripts/
│   └── download_placeholder.py
└── README.md
```

---

## Reemplazar el modelo placeholder por el propio

Una vez que tengas tu modelo entrenado (Etapa 2):

1. Copiá el archivo `cattle.onnx` a la carpeta `models/`.
2. Reiniciá el servidor. El backend lo detecta automáticamente.

También podés usar la variable de entorno:

```bash
CATTLE_MODEL_PATH=/ruta/a/tu/modelo.onnx uvicorn main:app --port 8000
```

---

## Limitaciones conocidas (Etapa 1)

- El **modelo placeholder** (YOLOv8n COCO) no está entrenado para vista aérea.
  Esperar baja precisión hasta tener el modelo propio.
- En fotos muy grandes (>20 MP, archivos >10 MB) el procesamiento puede tardar
  **1-3 minutos** en CPU. El frontend muestra el progreso.
- El tiling de 640px con 20% de overlap es un buen equilibrio. Si los animales
  son muy pequeños (vuelo a mucha altura), probá tile de 320px.
- No hay soporte de video todavía.

---

## Etapas del proyecto

| Etapa | Estado | Descripción |
|-------|--------|-------------|
| 1 | ✅ Completa | App funcional con modelo placeholder |
| 2 | 🔜 | Notebook Colab para entrenar modelo propio |
| 3 | 🔜 | Soporte bandas multiespectrales (NIR/Red-Edge) |
| 4 | 🔜 | Procesamiento de vuelo completo + ortomosaico |
