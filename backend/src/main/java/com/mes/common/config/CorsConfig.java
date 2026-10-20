package com.mes.common.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CorsConfig implements WebMvcConfigurer {

    // 브라우저에서 API를 호출할 수 있는 접속 출처. application.yml(app.cors.allowed-origin-patterns) 또는
    // 환경변수 CORS_ALLOWED_ORIGINS로 정한다 — 쉼표로 구분된 값이 배열로 들어온다.
    @Value("${app.cors.allowed-origin-patterns}")
    private String[] allowedOriginPatterns;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns(allowedOriginPatterns)
                .allowedMethods("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
    }
}
