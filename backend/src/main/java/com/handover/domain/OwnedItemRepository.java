package com.handover.domain;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OwnedItemRepository extends JpaRepository<OwnedItem, String> {

    List<OwnedItem> findByCaseIdOrderBySortOrderAsc(String caseId);

    List<OwnedItem> findByCaseIdAndDismissedFalseOrderBySortOrderAsc(String caseId);

    Optional<OwnedItem> findByIdAndCaseId(String id, String caseId);
}
