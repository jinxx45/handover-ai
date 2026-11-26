package com.handover.domain;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface InterviewTurnRepository extends JpaRepository<InterviewTurn, Long> {

    List<InterviewTurn> findByCaseIdOrderByIdAsc(String caseId);
}
