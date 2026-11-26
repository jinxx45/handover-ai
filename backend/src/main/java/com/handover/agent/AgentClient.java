package com.handover.agent;

import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** Thin HTTP client for the LangGraph agent service. */
@Component
public class AgentClient {

    private final RestClient client;

    public AgentClient(RestClient agentRestClient) {
        this.client = agentRestClient;
    }

    public AgentDtos.RunResponse start(AgentDtos.StartRun request) {
        return post("/runs", request, AgentDtos.RunResponse.class);
    }

    public AgentDtos.RunResponse answer(String runId, String answer) {
        return post("/runs/" + runId + "/answer", new AgentDtos.AnswerRequest(answer), AgentDtos.RunResponse.class);
    }

    public AgentDtos.RunResponse finish(String runId) {
        return post("/runs/" + runId + "/finish", null, AgentDtos.RunResponse.class);
    }

    public AgentDtos.RunResponse updateItems(String runId, AgentDtos.UpdateItems request) {
        return post("/runs/" + runId + "/items", request, AgentDtos.RunResponse.class);
    }

    public com.fasterxml.jackson.databind.JsonNode skills(AgentDtos.SkillsRequest request) {
        return post("/skills", request, com.fasterxml.jackson.databind.JsonNode.class);
    }

    public com.fasterxml.jackson.databind.JsonNode onboarding(AgentDtos.OnboardingRequest request) {
        return post("/onboarding", request, com.fasterxml.jackson.databind.JsonNode.class);
    }

    public AgentDtos.AskResponse ask(AgentDtos.AskRequest request) {
        return post("/ask", request, AgentDtos.AskResponse.class);
    }

    private <T> T post(String path, Object body, Class<T> type) {
        try {
            RestClient.RequestBodySpec spec = client.post().uri(path).contentType(MediaType.APPLICATION_JSON);
            if (body != null) {
                spec.body(body);
            }
            T result = spec.retrieve().body(type);
            if (result == null) {
                throw new AgentUnavailableException("Agent returned an empty response for " + path, null);
            }
            return result;
        } catch (RestClientException e) {
            throw new AgentUnavailableException("Agent call failed for " + path + ": " + e.getMessage(), e);
        }
    }
}
