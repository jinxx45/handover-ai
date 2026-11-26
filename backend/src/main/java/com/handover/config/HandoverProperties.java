package com.handover.config;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Typed view of the {@code handover.*} settings in application.yml. */
@ConfigurationProperties(prefix = "handover")
public record HandoverProperties(
        String agentUrl,
        int agentTimeoutSeconds,
        List<String> corsOrigins,
        String mediaDir,
        Connectors connectors) {

    public record Connectors(Fixture fixture, Github github, Jira jira, Confluence confluence, Google google,
                             PagerDuty pagerduty) {
    }

    public record Fixture(boolean enabled) {
    }

    /** apiUrl is https://api.github.com or https://<ghe-host>/api/v3 for GitHub Enterprise. */
    public record Github(String apiUrl, String token, String org) {
        public boolean configured() {
            return present(token) && present(org);
        }
    }

    /**
     * approvalJqlPending / approvalJqlHistory find approvals (Jira Service Management). {user} is replaced with
     * the person's email; on Jira Cloud you may need an accountId-based JQL instead.
     */
    public record Jira(String baseUrl, String email, String token, String approvalJqlPending,
                       String approvalJqlHistory) {
        public boolean configured() {
            return present(baseUrl) && present(token);
        }
    }

    /** baseUrl like https://acme.atlassian.net/wiki (Cloud) or https://confluence.acme.com (Server/DC). */
    public record Confluence(String baseUrl, String email, String token) {
        public boolean configured() {
            return present(baseUrl) && present(token);
        }
    }

    /**
     * An OAuth access token with drive.metadata.readonly and calendar.readonly scopes, e.g. from a service
     * account with domain-wide delegation. Drive and Calendar can be switched on separately.
     */
    public record Google(String accessToken, boolean driveEnabled, boolean calendarEnabled) {
        public boolean configured() {
            return present(accessToken);
        }
    }

    public record PagerDuty(String apiUrl, String token) {
        public boolean configured() {
            return present(token);
        }
    }

    private static boolean present(String s) {
        return s != null && !s.isBlank();
    }
}
