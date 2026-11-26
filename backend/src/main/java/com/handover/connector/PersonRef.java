package com.handover.connector;

/** Who is leaving, as connectors need to look them up. githubLogin is optional. */
public record PersonRef(String personId, String name, String email, String githubLogin) {
}
