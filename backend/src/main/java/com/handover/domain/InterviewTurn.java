package com.handover.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/** One answered interview question. Cited in the pack as I1, I2… (the label comes from the agent). */
@Entity
@Table(name = "interview_turn", indexes = @Index(columnList = "caseId"))
public class InterviewTurn {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String caseId;
    private String label;
    private String itemId;

    @Column(length = 2000)
    private String question;

    @Column(length = 8000)
    private String answer;

    private Instant createdAt;

    protected InterviewTurn() {
    }

    public InterviewTurn(String caseId, String label, String itemId, String question, String answer) {
        this.caseId = caseId;
        this.label = label;
        this.itemId = itemId;
        this.question = question;
        this.answer = answer;
        this.createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getCaseId() { return caseId; }
    public String getLabel() { return label; }
    public String getItemId() { return itemId; }
    public String getQuestion() { return question; }
    public String getAnswer() { return answer; }
    public Instant getCreatedAt() { return createdAt; }
}
