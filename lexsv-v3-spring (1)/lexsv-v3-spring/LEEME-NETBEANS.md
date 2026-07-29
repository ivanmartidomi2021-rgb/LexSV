# LexSV AI — Proyecto Spring Boot (para Apache NetBeans)

Este es un proyecto **Maven estándar**, así que Apache NetBeans lo reconoce
automáticamente como proyecto Java/Spring.

## Requisitos
- Apache NetBeans (con soporte Java, viene por defecto).
- JDK 17 o superior instalado y configurado en NetBeans (Tools → Java Platforms).
- Conexión a internet (para que Maven baje las dependencias de Spring Boot la primera vez).

## Abrir el proyecto
1. Descomprima este zip.
2. En NetBeans: **File → Open Project…** y seleccione la carpeta `lexsv-v3-spring`
   (la que contiene `pom.xml`). NetBeans la reconoce sola como proyecto Maven.
3. Espere a que NetBeans descargue las dependencias (barra de progreso abajo a la derecha).

## Configurar su clave de Gemini
Antes de correrlo, ponga su clave real (gratis en https://aistudio.google.com/app/apikey)
en uno de estos dos lugares:

**Opción A — directo en el archivo** `src/main/resources/application.properties`:
```
gemini.api.key=${GEMINI_API_KEY:AIzaSy...su-clave-real...}
```

**Opción B — variable de entorno (mejor para no dejar la clave en el código):**
En NetBeans: clic derecho sobre el proyecto → **Properties → Run → Environment Variables**
y agregue `GEMINI_API_KEY` = `su-clave-real`.

## Ejecutar
- Clic derecho sobre el proyecto → **Run** (o el botón ▶ verde).
- NetBeans compila con Maven y levanta el servidor embebido (Tomcat) en el puerto `8080`.
- Abra el navegador en: **http://localhost:8080**
- En la barra lateral de la app debe aparecer "Gemini AI activo ✅".

## Estructura del proyecto
```
lexsv-v3-spring/
├── pom.xml                                    ← dependencias Maven (Spring Boot Web)
├── src/main/java/com/lexsv/ai/
│   ├── LexsvAiApplication.java                 ← clase main (arranca el servidor)
│   └── GeminiController.java                   ← endpoint POST /api/gemini (oculta la clave)
└── src/main/resources/
    ├── application.properties                  ← aquí va su clave de Gemini
    └── static/                                  ← toda la interfaz (antes servida por Apache)
        ├── index.html, manifest.json, sw.js
        ├── css/style.css
        ├── js/app.js                            ← ahora llama a /api/gemini (no a Google directo)
        └── icons/
```

## Cómo funciona (por qué ya no falla)
- La clave de Gemini que traía el proyecto original estaba mal escrita y además
  quedaba expuesta en el navegador. Ahora `js/app.js` llama a `POST /api/gemini`
  (su propio servidor Spring Boot), y es `GeminiController.java` quien agrega la
  clave real y reenvía la petición a Google. La clave nunca sale del servidor.

## Empaquetar para producción (opcional)
Desde terminal, dentro de la carpeta del proyecto:
```bash
mvn clean package
java -jar target/lexsv-ai.jar
```
Esto genera un único `.jar` autocontenido (Tomcat embebido incluido) que puede
correr en cualquier servidor con Java 17, sin necesitar Apache HTTP ni PHP.
