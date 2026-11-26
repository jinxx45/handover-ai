package com.handover.web;

import java.util.List;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.handover.service.CaseService;
import com.handover.web.dto.CaseViews;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/v1/cases")
public class CaseController {

    private final CaseService service;

    public CaseController(CaseService service) {
        this.service = service;
    }

    @GetMapping
    public List<CaseViews.CaseSummary> list() {
        return service.list();
    }

    @GetMapping("/{caseId}")
    public CaseViews.CaseDetail get(@PathVariable String caseId) {
        return service.get(caseId);
    }

    @PostMapping("/{caseId}/interview/answer")
    public CaseViews.CaseDetail answer(@PathVariable String caseId, @Valid @RequestBody CaseViews.AnswerBody body) {
        return service.answer(caseId, body.answer());
    }

    @PostMapping("/{caseId}/interview/finish")
    public CaseViews.CaseDetail finish(@PathVariable String caseId) {
        return service.finishInterview(caseId);
    }

    @PostMapping("/{caseId}/retry")
    public CaseViews.CaseDetail retry(@PathVariable String caseId) {
        return service.retry(caseId);
    }

    @PostMapping("/{caseId}/pack/approve")
    public CaseViews.CaseDetail approve(@PathVariable String caseId, @Valid @RequestBody CaseViews.ApproveBody body) {
        return service.approve(caseId, body.approver());
    }

    @PatchMapping("/{caseId}/items/{itemId}")
    public CaseViews.CaseDetail assignSuccessor(@PathVariable String caseId, @PathVariable String itemId,
                                                @RequestBody CaseViews.SuccessorBody body) {
        return service.assignSuccessor(caseId, itemId, body.successor());
    }

    @PostMapping("/{caseId}/items")
    public CaseViews.CaseDetail addItem(@PathVariable String caseId, @Valid @RequestBody CaseViews.ManualItemBody body) {
        return service.addItem(caseId, body);
    }

    @DeleteMapping("/{caseId}/items/{itemId}")
    public CaseViews.CaseDetail dismissItem(@PathVariable String caseId, @PathVariable String itemId) {
        return service.dismissItem(caseId, itemId);
    }

    @PostMapping("/{caseId}/backfill")
    public CaseViews.CaseDetail backfill(@PathVariable String caseId) {
        return service.generateBackfill(caseId);
    }

    @PostMapping("/{caseId}/onboarding")
    public CaseViews.CaseDetail onboarding(@PathVariable String caseId) {
        return service.generateOnboarding(caseId);
    }

    @PostMapping("/{caseId}/attachments")
    public CaseViews.CaseDetail addLink(@PathVariable String caseId, @Valid @RequestBody CaseViews.LinkBody body) {
        return service.addLink(caseId, body);
    }

    @PostMapping(path = "/{caseId}/attachments/upload", consumes = "multipart/form-data")
    public CaseViews.CaseDetail upload(@PathVariable String caseId, @RequestParam("file") MultipartFile file,
                                       @RequestParam(required = false) String title,
                                       @RequestParam(required = false) String itemId,
                                       @RequestParam(required = false) String turnLabel,
                                       @RequestParam(required = false) String addedBy) throws java.io.IOException {
        return service.addRecording(caseId, file, title, itemId, turnLabel, addedBy);
    }

    @DeleteMapping("/{caseId}/attachments/{attachmentId}")
    public CaseViews.CaseDetail removeAttachment(@PathVariable String caseId, @PathVariable Long attachmentId) {
        return service.removeAttachment(caseId, attachmentId);
    }

    @PostMapping("/{caseId}/ask")
    public CaseViews.QuestionView ask(@PathVariable String caseId, @Valid @RequestBody CaseViews.AskBody body) {
        return service.ask(caseId, body.question(), body.askedBy());
    }
}
