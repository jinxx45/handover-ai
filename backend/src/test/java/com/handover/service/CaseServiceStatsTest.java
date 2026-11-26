package com.handover.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.handover.domain.Coverage;
import com.handover.domain.OwnedItem;
import com.handover.web.dto.CaseViews;

class CaseServiceStatsTest {

    private static OwnedItem item(String id, Coverage coverage, boolean needsInterview) {
        OwnedItem i = new OwnedItem(id, "case-1");
        i.setCoverage(coverage);
        i.setNeedsInterview(needsInterview);
        return i;
    }

    @Test
    void coverageCountsDocumentedAndInterviewed() {
        CaseViews.Stats s = CaseService.stats(List.of(
                item("a", Coverage.DOCUMENTED, false),
                item("b", Coverage.INTERVIEWED, true),
                item("c", Coverage.NONE, true),
                item("d", Coverage.NONE, false)));
        assertThat(s.total()).isEqualTo(4);
        assertThat(s.coveragePct()).isEqualTo(50);
        assertThat(s.atRisk()).isEqualTo(1);
        assertThat(s.uncovered()).isEqualTo(2);
    }

    @Test
    void emptyCaseHasZeroCoverage() {
        assertThat(CaseService.stats(List.of()).coveragePct()).isZero();
    }
}
