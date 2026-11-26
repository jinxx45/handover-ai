package com.handover.agent;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;

/** JSON contract with the Python agent service (see agent/app/models.py). */
public final class AgentDtos {

    private AgentDtos() {
    }

    public record Item(String id, String kind, String title, String source, String url, int activity,
                       boolean hasDocs, Integer lastActivityDays, Double ownershipShare, boolean needsReassignment,
                       String successor) {
    }

    public record Evidence(String id, String itemId, String source, String url, String text) {
    }

    public record Answer(String id, String itemId, String question, String answer) {
    }

    public record StartRun(String caseId, String personName, String role, List<Item> items, List<Evidence> evidence) {
    }

    public record AnswerRequest(String answer) {
    }

    public record Analysis(String itemId, double riskScore, String reason, boolean needsInterview) {
    }

    public record Question(String itemId, String itemTitle, String question,
                           @JsonProperty("isFollowup") boolean isFollowup, int remaining) {
    }

    /** status is INTERVIEWING (question set) or DRAFTED (pack set). */
    public record RunResponse(String runId, String status, List<Analysis> analysis, Question question,
                              List<Answer> answers, JsonNode pack) {
    }

    public record UpdateItems(List<Item> add, List<Evidence> evidence, List<String> remove) {
    }

    public record Attachment(String id, String itemId, String turnLabel, String kind, String url, String title) {
    }

    public record OnboardingRequest(String personName, String role, String managerName, List<Item> items,
                                    List<Evidence> evidence, List<Answer> answers, List<Attachment> attachments,
                                    JsonNode skills) {
    }

    public record SkillsRequest(String personName, String role, List<Item> items, List<Evidence> evidence,
                                List<Answer> answers) {
    }

    public record AskRequest(String question, JsonNode pack, List<Evidence> evidence, List<Answer> answers) {
    }

    public record AskResponse(String answer, List<String> citations, boolean covered) {
    }
}
