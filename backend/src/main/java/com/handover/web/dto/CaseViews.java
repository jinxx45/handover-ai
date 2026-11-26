package com.handover.web.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import com.handover.domain.CaseStatus;
import com.handover.domain.Coverage;

/** Read models returned to the UI. */
public final class CaseViews {

    private CaseViews() {
    }

    public record CaseSummary(String id, String personName, String role, CaseStatus status, LocalDate lastDay,
                              Long daysLeft, int itemCount, int coveragePct, int atRisk, int toReassign,
                              Instant createdAt) {
    }

    public record Person(String personId, String name, String email, String role, String managerName,
                         LocalDate lastDay, Long daysLeft, String exitType) {
    }

    /** toReassign = approvals/duties that need a new owner and have no successor assigned yet. */
    public record Stats(int total, int documented, int interviewed, int uncovered, int atRisk, int toReassign,
                        int coveragePct) {
    }

    public record ItemView(String id, String kind, String title, String source, String url, int activity,
                           boolean hasDocs, Integer lastActivityDays, Double ownershipShare,
                           boolean needsReassignment, Double riskScore, String riskReason,
                           boolean needsInterview, Coverage coverage, String successor, String origin,
                           String addedBy) {
    }

    public record TurnView(String label, String itemId, String question, String answer, Instant createdAt) {
    }

    public record EvidenceView(String label, String itemId, String source, String url, String text) {
    }

    public record QuestionView(Long id, String askedBy, String question, String answer, List<String> citations,
                               boolean covered, Instant createdAt) {
    }

    public record CaseDetail(String id, Person person, CaseStatus status, String errorMessage, String eventSource,
                             Stats stats, List<ItemView> items, JsonNode currentQuestion, List<TurnView> turns,
                             JsonNode pack, JsonNode backfill, JsonNode onboarding, List<AttachmentView> attachments,
                             String approvedBy, Instant approvedAt,
                             List<QuestionView> questions,
                             List<EvidenceView> evidence, Instant createdAt) {
    }

    public record AnswerBody(@jakarta.validation.constraints.NotBlank String answer) {
    }

    public record ApproveBody(@jakarta.validation.constraints.NotBlank String approver) {
    }

    public record AskBody(@jakarta.validation.constraints.NotBlank String question, String askedBy) {
    }

    public record SuccessorBody(String successor) {
    }

    /** Something the tools missed, added by the leaver or their manager. */
    public record ManualItemBody(@jakarta.validation.constraints.NotBlank String title, String kind, String notes,
                                 boolean needsReassignment, String addedBy) {
    }

    public record ConnectorView(String name, boolean enabled) {
    }

    public record AttachmentView(Long id, String itemId, String turnLabel, String kind, String url, String title,
                                 String addedBy, Instant createdAt) {
    }

    /** A link to a video or document (Drive, Loom, YouTube, SharePoint...) on an answer or item. */
    public record LinkBody(@jakarta.validation.constraints.NotBlank String url, String title, String itemId,
                           String turnLabel, String addedBy) {
    }
}
