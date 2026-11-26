package com.handover.domain;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PackQuestionRepository extends JpaRepository<PackQuestion, Long> {

    List<PackQuestion> findByCaseIdOrderByIdDesc(String caseId);
}
