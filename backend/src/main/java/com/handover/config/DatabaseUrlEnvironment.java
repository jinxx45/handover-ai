package com.handover.config;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.util.StringUtils;

/**
 * Lets the backend share one connection string with the agent. Hosts such as Neon and Render hand out
 * {@code postgresql://user:pass@host/db?sslmode=require}; JDBC needs the URL, user and password split
 * apart. When DATABASE_URL is set (and DB_URL is not), this turns it into the three spring.datasource
 * properties.
 */
public class DatabaseUrlEnvironment implements EnvironmentPostProcessor, Ordered {

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment env, SpringApplication app) {
        String raw = env.getProperty("DATABASE_URL");
        if (!StringUtils.hasText(raw) || StringUtils.hasText(env.getProperty("DB_URL"))) {
            return;
        }
        URI uri = URI.create(raw.trim());
        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equals("postgres") || scheme.equals("postgresql"))) {
            return;
        }
        String jdbc = "jdbc:postgresql://" + uri.getHost() + (uri.getPort() > 0 ? ":" + uri.getPort() : "")
                + uri.getRawPath() + "?sslmode=" + sslMode(uri.getRawQuery());

        Map<String, Object> props = new HashMap<>();
        props.put("spring.datasource.url", jdbc);
        String info = uri.getRawUserInfo();
        if (info != null) {
            int colon = info.indexOf(':');
            props.put("spring.datasource.username", decode(colon < 0 ? info : info.substring(0, colon)));
            if (colon >= 0) {
                props.put("spring.datasource.password", decode(info.substring(colon + 1)));
            }
        }
        env.getPropertySources().addFirst(new MapPropertySource("databaseUrl", props));
    }

    private static String sslMode(String query) {
        if (query != null) {
            for (String part : query.split("&")) {
                if (part.startsWith("sslmode=")) {
                    return part.substring("sslmode=".length());
                }
            }
        }
        return "require";
    }

    private static String decode(String s) {
        return URLDecoder.decode(s, StandardCharsets.UTF_8);
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }
}
