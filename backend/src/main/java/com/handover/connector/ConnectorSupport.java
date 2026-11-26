package com.handover.connector;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/** Small helpers shared by connectors. */
final class ConnectorSupport {

    /** How far back connectors look for activity. */
    static final int LOOKBACK_DAYS = 180;

    private ConnectorSupport() {
    }

    static boolean present(String s) {
        return s != null && !s.isBlank();
    }

    /** Atlassian auth: basic (Cloud: email + API token) when an email is given, otherwise bearer (Server/DC PAT). */
    static String atlassianAuth(String email, String token) {
        return present(email)
                ? "Basic " + Base64.getEncoder().encodeToString((email + ":" + token).getBytes(StandardCharsets.UTF_8))
                : "Bearer " + token;
    }

    static String trimSlash(String url) {
        return url.replaceAll("/+$", "");
    }
}
