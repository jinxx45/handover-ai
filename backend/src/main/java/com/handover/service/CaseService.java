package com.handover.service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.handover.agent.AgentClient;
import com.handover.agent.AgentDtos;
import com.handover.agent.AgentUnavailableException;
import com.handover.connector.DiscoveredItem;
import com.handover.connector.PersonRef;
import com.handover.connector.WorkConnector;
import com.handover.domain.Attachment;
import com.handover.domain.AttachmentRepository;
import com.handover.domain.CaseStatus;
import com.handover.domain.Coverage;
import com.handover.domain.EvidenceChunk;
import com.handover.domain.EvidenceChunkRepository;
import com.handover.domain.HandoverCase;
import com.handover.domain.HandoverCaseRepository;
import com.handover.domain.InterviewTurn;
import com.handover.domain.InterviewTurnRepository;
import com.handover.domain.OwnedItem;
import com.handover.domain.OwnedItemRepository;
import com.handover.domain.PackQuestion;
import com.handover.domain.PackQuestionRepository;
import com.handover.web.dto.CaseViews;
import com.handover.web.dto.DepartureEvent;

/**
 * Orchestrates a handover: event in → connectors map ownership → agent interviews →
 * pack drafted → manager approves → successor asks questions.
 */
@Service
public class CaseService {

    private static final Logger log = LoggerFactory.getLogger(CaseService.class);
    public static final String DEPARTED_EVENT = "person.departed";

    private final HandoverCaseRepository cases;
    private final OwnedItemRepository items;
    private final EvidenceChunkRepository evidence;
    private final InterviewTurnRepository turns;
    private final PackQuestionRepository questions;
    private final AttachmentRepository attachments;
    private final MediaStorage media;
    private final List<WorkConnector> connectors;
    private final AgentClient agent;
    private final ObjectMapper mapper;

    public CaseService(HandoverCaseRepository cases, OwnedItemRepository items, EvidenceChunkRepository evidence,
                       InterviewTurnRepository turns, PackQuestionRepository questions,
                       AttachmentRepository attachments, MediaStorage media,
                       List<WorkConnector> connectors, AgentClient agent, ObjectMapper mapper) {
        this.cases = cases;
        this.items = items;
        this.evidence = evidence;
        this.turns = turns;
        this.questions = questions;
        this.attachments = attachments;
        this.media = media;
        this.connectors = connectors;
        this.agent = agent;
        this.mapper = mapper;
    }

    // ------------------------------------------------------------------ queries

    @Transactional(readOnly = true)
    public List<CaseViews.CaseSummary> list() {
        return cases.findAllByOrderByCreatedAtDesc().stream().map(c -> {
            CaseViews.Stats s = stats(items.findByCaseIdAndDismissedFalseOrderBySortOrderAsc(c.getId()));
            return new CaseViews.CaseSummary(c.getId(), c.getPersonName(), c.getRole(), c.getStatus(), c.getLastDay(),
                    daysLeft(c.getLastDay()), s.total(), s.coveragePct(), s.atRisk(), s.toReassign(), c.getCreatedAt());
        }).toList();
    }

    @Transactional(readOnly = true)
    public CaseViews.CaseDetail get(String caseId) {
        return detail(find(caseId));
    }

    // ------------------------------------------------------------------ commands

    /** Idempotent on the event id: a re-delivered event returns the existing case. */
    @Transactional
    public CaseViews.CaseDetail createFromEvent(DepartureEvent event) {
        if (!DEPARTED_EVENT.equals(event.type())) {
            throw new IllegalArgumentException("Unsupported event type: " + event.type());
        }
        var existing = cases.findByEventId(event.id());
        if (existing.isPresent()) {
            return detail(existing.get());
        }

        DepartureEvent.Data d = event.data();
        HandoverCase c = new HandoverCase(UUID.randomUUID().toString());
        c.setEventId(event.id());
        c.setEventSource(event.source() == null ? "unknown" : event.source());
        c.setPersonId(d.personId());
        c.setPersonName(d.name());
        c.setEmail(d.email());
        c.setRole(d.role());
        c.setManagerName(d.managerName());
        c.setLastDay(d.lastDay());
        c.setExitType(d.exitType() == null ? "voluntary" : d.exitType());
        cases.save(c);

        mapOwnership(c, new PersonRef(d.personId(), d.name(), d.email(), d.githubLogin()));
        startAgentRun(c);
        return detail(c);
    }

    @Transactional
    public CaseViews.CaseDetail answer(String caseId, String answer) {
        HandoverCase c = find(caseId);
        requireStatus(c, CaseStatus.INTERVIEWING);
        apply(c, agent.answer(c.getAgentRunId(), answer.trim()));
        return detail(c);
    }

    /** Stop interviewing and draft the pack from what has been captured so far. */
    @Transactional
    public CaseViews.CaseDetail finishInterview(String caseId) {
        HandoverCase c = find(caseId);
        requireStatus(c, CaseStatus.INTERVIEWING);
        apply(c, agent.finish(c.getAgentRunId()));
        return detail(c);
    }

    /** Re-run the agent for a case that failed (e.g. the agent was down when the event arrived). */
    @Transactional
    public CaseViews.CaseDetail retry(String caseId) {
        HandoverCase c = find(caseId);
        requireStatus(c, CaseStatus.FAILED);
        startAgentRun(c);
        return detail(c);
    }

    @Transactional
    public CaseViews.CaseDetail approve(String caseId, String approver) {
        HandoverCase c = find(caseId);
        requireStatus(c, CaseStatus.REVIEW);
        c.setStatus(CaseStatus.PUBLISHED);
        c.setApprovedBy(approver);
        c.setApprovedAt(java.time.Instant.now());
        return detail(c);
    }

    @Transactional
    public CaseViews.CaseDetail assignSuccessor(String caseId, String itemId, String successor) {
        find(caseId);
        OwnedItem item = items.findByIdAndCaseId(itemId, caseId)
                .orElseThrow(() -> new NotFoundException("Item " + itemId + " not found"));
        item.setSuccessor(successor == null || successor.isBlank() ? null : successor.trim());
        return get(caseId);
    }

    /** Adds something the connectors missed. While the run is open, the agent scores it and may ask about it. */
    @Transactional
    public CaseViews.CaseDetail addItem(String caseId, CaseViews.ManualItemBody body) {
        HandoverCase c = find(caseId);
        List<OwnedItem> all = items.findByCaseIdOrderBySortOrderAsc(caseId);
        OwnedItem item = new OwnedItem(UUID.randomUUID().toString(), caseId);
        item.setKind(body.kind() == null || body.kind().isBlank() ? "other" : body.kind());
        item.setTitle(body.title().trim());
        item.setSource("manual");
        item.setOrigin("manual");
        item.setAddedBy(body.addedBy());
        item.setNeedsReassignment(body.needsReassignment());
        item.setCoverage(Coverage.NONE);
        item.setSortOrder(all.stream().mapToInt(OwnedItem::getSortOrder).max().orElse(0) + 1);
        items.save(item);

        List<AgentDtos.Evidence> newEvidence = new ArrayList<>();
        if (body.notes() != null && !body.notes().isBlank()) {
            String label = "E" + (evidence.findByCaseIdOrderByIdAsc(caseId).size() + 1);
            EvidenceChunk chunk = evidence.save(new EvidenceChunk(caseId, label, item.getId(), "manual", null,
                    "Added by " + (body.addedBy() == null ? "hand" : body.addedBy()) + ": " + body.notes().trim()));
            newEvidence.add(new AgentDtos.Evidence(chunk.getLabel(), item.getId(), "manual", null, chunk.getText()));
        }
        syncAgent(c, List.of(toAgentItem(item)), newEvidence, List.of());
        return detail(c);
    }

    /** "Not theirs": hides the item and drops it from the interview if it was still to be asked about. */
    @Transactional
    public CaseViews.CaseDetail dismissItem(String caseId, String itemId) {
        HandoverCase c = find(caseId);
        OwnedItem item = items.findByIdAndCaseId(itemId, caseId)
                .orElseThrow(() -> new NotFoundException("Item " + itemId + " not found"));
        item.setDismissed(true);
        syncAgent(c, List.of(), List.of(), List.of(itemId));
        return detail(c);
    }

    private void syncAgent(HandoverCase c, List<AgentDtos.Item> add, List<AgentDtos.Evidence> ev, List<String> remove) {
        boolean runOpen = c.getAgentRunId() != null
                && (c.getStatus() == CaseStatus.INTERVIEWING || c.getStatus() == CaseStatus.REVIEW);
        if (runOpen) {
            apply(c, agent.updateItems(c.getAgentRunId(), new AgentDtos.UpdateItems(add, ev, remove)));
        }
    }

    private static AgentDtos.Item toAgentItem(OwnedItem i) {
        return new AgentDtos.Item(i.getId(), i.getKind(), i.getTitle(), i.getSource(), i.getUrl(), i.getActivity(),
                i.isHasDocs(), i.getLastActivityDays(), i.getOwnershipShare(), i.isNeedsReassignment(), i.getSuccessor());
    }

    /** Works out the skills the backfill needs from everything known about the role so far. */
    @Transactional
    public CaseViews.CaseDetail generateBackfill(String caseId) {
        HandoverCase c = find(caseId);
        List<AgentDtos.Item> owned = items.findByCaseIdAndDismissedFalseOrderBySortOrderAsc(caseId).stream()
                .map(CaseService::toAgentItem).toList();
        JsonNode profile = agent.skills(new AgentDtos.SkillsRequest(c.getPersonName(), c.getRole(), owned,
                agentEvidence(caseId), agentAnswers(caseId)));
        c.setBackfillJson(profile.toString());
        return detail(c);
    }

    /** Adds a link (Drive, Loom, YouTube...) to an answer or item. Only http(s) links are accepted. */
    @Transactional
    public CaseViews.CaseDetail addLink(String caseId, CaseViews.LinkBody body) {
        HandoverCase c = find(caseId);
        String url = body.url().trim();
        if (!url.matches("(?i)^https?://.+")) {
            throw new IllegalArgumentException("Links must start with http:// or https://");
        }
        String title = body.title() == null || body.title().isBlank() ? url : body.title().trim();
        attachments.save(new Attachment(caseId, body.itemId(), body.turnLabel(), "link", url, title, null, body.addedBy()));
        return detail(c);
    }

    /** Stores an uploaded or recorded video/audio file and attaches it to an answer or item. */
    @Transactional
    public CaseViews.CaseDetail addRecording(String caseId, org.springframework.web.multipart.MultipartFile file,
                                             String title, String itemId, String turnLabel, String addedBy)
            throws java.io.IOException {
        HandoverCase c = find(caseId);
        String name = media.save(file);
        attachments.save(new Attachment(caseId, itemId, turnLabel, MediaStorage.kindFor(name), "/v1/media/" + name,
                title == null || title.isBlank() ? "Recording" : title.trim(), name, addedBy));
        return detail(c);
    }

    @Transactional
    public CaseViews.CaseDetail removeAttachment(String caseId, Long attachmentId) {
        HandoverCase c = find(caseId);
        attachments.delete(attachments.findByIdAndCaseId(attachmentId, caseId)
                .orElseThrow(() -> new NotFoundException("Attachment " + attachmentId + " not found")));
        return detail(c);
    }

    /** Builds the onboarding kit for whoever backfills the role, reusing the backfill skills when present. */
    @Transactional
    public CaseViews.CaseDetail generateOnboarding(String caseId) {
        HandoverCase c = find(caseId);
        JsonNode backfill = readJson(c.getBackfillJson());
        JsonNode skills = backfill == null ? null : backfill.get("skills");
        List<AgentDtos.Item> owned = items.findByCaseIdAndDismissedFalseOrderBySortOrderAsc(caseId).stream()
                .map(CaseService::toAgentItem).toList();
        JsonNode kit = agent.onboarding(new AgentDtos.OnboardingRequest(c.getPersonName(), c.getRole(),
                c.getManagerName(), owned, agentEvidence(caseId), agentAnswers(caseId), agentAttachments(caseId), skills));
        c.setOnboardingJson(kit.toString());
        return detail(c);
    }

    @Transactional
    public CaseViews.QuestionView ask(String caseId, String question, String askedBy) {
        HandoverCase c = find(caseId);
        if (c.getStatus() != CaseStatus.PUBLISHED && c.getStatus() != CaseStatus.REVIEW) {
            throw new ConflictException("The handover notes are not written yet");
        }
        AgentDtos.AskResponse r = agent.ask(new AgentDtos.AskRequest(question.trim(), readJson(c.getPackJson()),
                agentEvidence(c.getId()), agentAnswers(c.getId())));
        List<String> cites = r.citations() == null ? List.of() : r.citations();
        PackQuestion saved = questions.save(new PackQuestion(c.getId(), askedBy == null ? "successor" : askedBy,
                question.trim(), r.answer(), String.join(",", cites), r.covered()));
        return toView(saved);
    }

    // ------------------------------------------------------------------ internals

    private void mapOwnership(HandoverCase c, PersonRef person) {
        List<DiscoveredItem> found = new ArrayList<>();
        for (WorkConnector connector : connectors) {
            if (!connector.enabled()) {
                continue;
            }
            try {
                List<DiscoveredItem> result = connector.discover(person);
                log.info("Connector {} found {} items for {}", connector.name(), result.size(), person.personId());
                found.addAll(result);
            } catch (RuntimeException e) {
                log.warn("Connector {} failed: {}", connector.name(), e.getMessage());
            }
        }

        int order = 0;
        int label = 1;
        for (DiscoveredItem d : found) {
            OwnedItem item = new OwnedItem(UUID.randomUUID().toString(), c.getId());
            item.setKind(d.kind());
            item.setTitle(d.title());
            item.setSource(d.source());
            item.setUrl(d.url());
            item.setActivity(d.activity());
            item.setHasDocs(d.hasDocs());
            item.setLastActivityDays(d.lastActivityDays());
            item.setOwnershipShare(d.ownershipShare());
            item.setNeedsReassignment(d.needsReassignment());
            item.setCoverage(d.hasDocs() ? Coverage.DOCUMENTED : Coverage.NONE);
            item.setSortOrder(order++);
            items.save(item);
            for (String text : d.evidence()) {
                evidence.save(new EvidenceChunk(c.getId(), "E" + label++, item.getId(), d.source(), d.url(), text));
            }
        }
        if (found.isEmpty()) {
            c.setErrorMessage("No owned items were found. Configure GitHub/Jira connectors or use a demo person.");
        }
    }

    private void startAgentRun(HandoverCase c) {
        List<OwnedItem> owned = items.findByCaseIdAndDismissedFalseOrderBySortOrderAsc(c.getId());
        List<AgentDtos.Item> agentItems = owned.stream().map(CaseService::toAgentItem).toList();
        try {
            AgentDtos.RunResponse r = agent.start(new AgentDtos.StartRun(c.getId(), c.getPersonName(), c.getRole(),
                    agentItems, agentEvidence(c.getId())));
            apply(c, r);
        } catch (AgentUnavailableException e) {
            log.error("Agent unavailable for case {}: {}", c.getId(), e.getMessage());
            c.setStatus(CaseStatus.FAILED);
            c.setErrorMessage("The agent service is unreachable. Start it and press Retry.");
        }
    }

    /** Copies the agent's view (risk, answers, question or pack) onto the case. */
    private void apply(HandoverCase c, AgentDtos.RunResponse r) {
        c.setAgentRunId(r.runId());
        List<OwnedItem> owned = items.findByCaseIdAndDismissedFalseOrderBySortOrderAsc(c.getId());
        Map<String, OwnedItem> byId = owned.stream().collect(Collectors.toMap(OwnedItem::getId, i -> i));

        if (r.analysis() != null) {
            for (AgentDtos.Analysis a : r.analysis()) {
                OwnedItem item = byId.get(a.itemId());
                if (item != null) {
                    item.setRiskScore(a.riskScore());
                    item.setRiskReason(a.reason());
                    item.setNeedsInterview(a.needsInterview());
                }
            }
        }

        Set<String> known = turns.findByCaseIdOrderByIdAsc(c.getId()).stream()
                .map(InterviewTurn::getLabel).collect(Collectors.toCollection(HashSet::new));
        if (r.answers() != null) {
            for (AgentDtos.Answer a : r.answers()) {
                if (known.add(a.id())) {
                    turns.save(new InterviewTurn(c.getId(), a.id(), a.itemId(), a.question(), a.answer()));
                }
            }
        }
        Set<String> interviewed = turns.findByCaseIdOrderByIdAsc(c.getId()).stream()
                .map(InterviewTurn::getItemId).collect(Collectors.toSet());
        for (OwnedItem item : owned) {
            item.setCoverage(interviewed.contains(item.getId()) ? Coverage.INTERVIEWED
                    : item.isHasDocs() ? Coverage.DOCUMENTED : Coverage.NONE);
        }

        if ("INTERVIEWING".equals(r.status()) && r.question() != null) {
            c.setStatus(CaseStatus.INTERVIEWING);
            c.setCurrentQuestionJson(writeJson(r.question()));
        } else {
            c.setStatus(CaseStatus.REVIEW);
            c.setCurrentQuestionJson(null);
            c.setPackJson(r.pack() == null ? null : r.pack().toString());
        }
        if (c.getStatus() != CaseStatus.FAILED && c.getErrorMessage() != null
                && c.getErrorMessage().startsWith("The agent service")) {
            c.setErrorMessage(null);
        }
    }

    private List<AgentDtos.Evidence> agentEvidence(String caseId) {
        Set<String> live = items.findByCaseIdAndDismissedFalseOrderBySortOrderAsc(caseId).stream()
                .map(OwnedItem::getId).collect(Collectors.toSet());
        return evidence.findByCaseIdOrderByIdAsc(caseId).stream()
                .filter(e -> e.getItemId() == null || live.contains(e.getItemId()))
                .map(e -> new AgentDtos.Evidence(e.getLabel(), e.getItemId(), e.getSource(), e.getUrl(), e.getText()))
                .toList();
    }

    private List<AgentDtos.Answer> agentAnswers(String caseId) {
        Map<String, List<Attachment>> byTurn = attachments.findByCaseIdOrderByIdAsc(caseId).stream()
                .filter(a -> a.getTurnLabel() != null)
                .collect(Collectors.groupingBy(Attachment::getTurnLabel));
        return turns.findByCaseIdOrderByIdAsc(caseId).stream()
                .map(t -> {
                    String extra = byTurn.getOrDefault(t.getLabel(), List.of()).stream()
                            .map(a -> " [" + ("link".equals(a.getKind()) ? "Link" : "Recording") + ": " + a.getTitle() + ", " + a.getUrl() + "]")
                            .reduce("", String::concat);
                    return new AgentDtos.Answer(t.getLabel(), t.getItemId(), t.getQuestion(), t.getAnswer() + extra);
                })
                .toList();
    }

    private List<AgentDtos.Attachment> agentAttachments(String caseId) {
        return attachments.findByCaseIdOrderByIdAsc(caseId).stream()
                .map(a -> new AgentDtos.Attachment("A" + a.getId(), a.getItemId(), a.getTurnLabel(), a.getKind(),
                        a.getUrl(), a.getTitle()))
                .toList();
    }

    private static CaseViews.AttachmentView toView(Attachment a) {
        return new CaseViews.AttachmentView(a.getId(), a.getItemId(), a.getTurnLabel(), a.getKind(), a.getUrl(),
                a.getTitle(), a.getAddedBy(), a.getCreatedAt());
    }

    private CaseViews.CaseDetail detail(HandoverCase c) {
        List<OwnedItem> owned = items.findByCaseIdAndDismissedFalseOrderBySortOrderAsc(c.getId());
        List<CaseViews.ItemView> itemViews = owned.stream()
                .sorted((a, b) -> Double.compare(nz(b.getRiskScore()), nz(a.getRiskScore())))
                .map(i -> new CaseViews.ItemView(i.getId(), i.getKind(), i.getTitle(), i.getSource(), i.getUrl(),
                        i.getActivity(), i.isHasDocs(), i.getLastActivityDays(), i.getOwnershipShare(),
                        i.isNeedsReassignment(), i.getRiskScore(), i.getRiskReason(),
                        i.isNeedsInterview(), i.getCoverage(), i.getSuccessor(), i.getOrigin(), i.getAddedBy()))
                .toList();
        CaseViews.Person person = new CaseViews.Person(c.getPersonId(), c.getPersonName(), c.getEmail(), c.getRole(),
                c.getManagerName(), c.getLastDay(), daysLeft(c.getLastDay()), c.getExitType());
        List<CaseViews.TurnView> turnViews = turns.findByCaseIdOrderByIdAsc(c.getId()).stream()
                .map(t -> new CaseViews.TurnView(t.getLabel(), t.getItemId(), t.getQuestion(), t.getAnswer(), t.getCreatedAt()))
                .toList();
        List<CaseViews.EvidenceView> evidenceViews = evidence.findByCaseIdOrderByIdAsc(c.getId()).stream()
                .map(e -> new CaseViews.EvidenceView(e.getLabel(), e.getItemId(), e.getSource(), e.getUrl(), e.getText()))
                .toList();
        List<CaseViews.QuestionView> qViews = questions.findByCaseIdOrderByIdDesc(c.getId()).stream()
                .map(this::toView).toList();
        return new CaseViews.CaseDetail(c.getId(), person, c.getStatus(), c.getErrorMessage(), c.getEventSource(),
                stats(owned), itemViews, readJson(c.getCurrentQuestionJson()), turnViews, readJson(c.getPackJson()),
                readJson(c.getBackfillJson()), readJson(c.getOnboardingJson()),
                attachments.findByCaseIdOrderByIdAsc(c.getId()).stream().map(CaseService::toView).toList(),
                c.getApprovedBy(), c.getApprovedAt(), qViews, evidenceViews, c.getCreatedAt());
    }

    private CaseViews.QuestionView toView(PackQuestion q) {
        List<String> cites = q.getCitations() == null || q.getCitations().isBlank() ? List.of()
                : Arrays.stream(q.getCitations().split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        return new CaseViews.QuestionView(q.getId(), q.getAskedBy(), q.getQuestion(), q.getAnswer(), cites,
                q.isCovered(), q.getCreatedAt());
    }

    static CaseViews.Stats stats(List<OwnedItem> owned) {
        Map<Coverage, Integer> counts = new HashMap<>();
        int atRisk = 0;
        int toReassign = 0;
        for (OwnedItem i : owned) {
            counts.merge(i.getCoverage(), 1, Integer::sum);
            if (i.isNeedsInterview() && i.getCoverage() == Coverage.NONE) {
                atRisk++;
            }
            if (i.isNeedsReassignment() && (i.getSuccessor() == null || i.getSuccessor().isBlank())) {
                toReassign++;
            }
        }
        int total = owned.size();
        int documented = counts.getOrDefault(Coverage.DOCUMENTED, 0);
        int interviewed = counts.getOrDefault(Coverage.INTERVIEWED, 0);
        int pct = total == 0 ? 0 : Math.round((documented + interviewed) * 100f / total);
        return new CaseViews.Stats(total, documented, interviewed, counts.getOrDefault(Coverage.NONE, 0), atRisk,
                toReassign, pct);
    }

    private HandoverCase find(String caseId) {
        return cases.findById(caseId).orElseThrow(() -> new NotFoundException("Case " + caseId + " not found"));
    }

    private static void requireStatus(HandoverCase c, CaseStatus expected) {
        if (c.getStatus() != expected) {
            throw new ConflictException("Case is " + c.getStatus() + ", expected " + expected);
        }
    }

    private static Long daysLeft(LocalDate lastDay) {
        return lastDay == null ? null : ChronoUnit.DAYS.between(LocalDate.now(), lastDay);
    }

    private static double nz(Double d) {
        return d == null ? -1 : d;
    }

    private JsonNode readJson(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return mapper.readTree(json);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Stored JSON is invalid", e);
        }
    }

    private String writeJson(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not serialise agent response", e);
        }
    }
}
