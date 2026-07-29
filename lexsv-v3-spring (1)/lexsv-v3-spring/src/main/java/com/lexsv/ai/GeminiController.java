package com.lexsv.ai;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestTemplate;

/**
 * Proxy hacia Google Gemini.
 * El frontend (js/app.js) llama a POST /api/gemini con el mismo body que
 * antes se mandaba directo a Google. Aqui se agrega la clave, que vive
 * SOLO en el servidor (application.properties / variable de entorno),
 * nunca en el navegador.
 */
@RestController
@RequestMapping("/api")
public class GeminiController {

    private final RestTemplate restTemplate;

    @Value("${gemini.api.key:}")
    private String apiKey;

    @Value("${gemini.model:gemini-3.5-flash}")
    private String model;

    public GeminiController(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @PostMapping(value = "/gemini", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> proxyGemini(@RequestBody String body) {
        if (apiKey == null || apiKey.isBlank() || apiKey.contains("PON_AQUI")) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("{\"error\":{\"message\":\"Clave Gemini no configurada. Edite src/main/resources/application.properties o la variable de entorno GEMINI_API_KEY.\"}}");
        }

        String url = "https://generativelanguage.googleapis.com/v1beta/models/"
                + model + ":generateContent?key=" + apiKey;

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<String> request = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<String> resp = restTemplate.postForEntity(url, request, String.class);
            return ResponseEntity.status(resp.getStatusCode()).body(resp.getBody());
        } catch (HttpClientErrorException | HttpServerErrorException ex) {
            // Reenvia el error tal cual lo devuelve Google (clave invalida, cuota, etc.)
            return ResponseEntity.status(ex.getStatusCode()).body(ex.getResponseBodyAsString());
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body("{\"error\":{\"message\":\"No se pudo contactar a Gemini: " + ex.getMessage() + "\"}}");
        }
    }
}
