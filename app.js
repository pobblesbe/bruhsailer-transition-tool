(function () {
  const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
  const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
  const oldGuideList = document.getElementById("oldGuideList");
  const diffStatus = document.getElementById("diffStatus");
  const diffContent = document.getElementById("diffContent");
  const catchupStatus = document.getElementById("catchupStatus");
  const catchupOnboarding = document.getElementById("catchupOnboarding");
  const catchupList = document.getElementById("catchupList");
  const planHelp = document.getElementById("planHelp");
  const catchupSummary = document.getElementById("catchupSummary");
  const catchupCompletion = document.getElementById("catchupCompletion");
  const catchupCompletionTitle = document.getElementById("catchupCompletionTitle");
  const catchupCompletionText = document.getElementById("catchupCompletionText");
  const catchupCompletionLink = document.getElementById("catchupCompletionLink");
  const jumpNextBtn = document.getElementById("jumpNextBtn");
  const correspondingStepLabel = document.getElementById("correspondingStepLabel");
  const openGuideLink = document.getElementById("openGuideLink");
  const appFooter = document.getElementById("appFooter");
  const oldPanel = document.querySelector(".old-panel");
  const oldSelectionPill = document.getElementById("oldSelectionPill");
  const rightPanel = document.querySelector(".right-panel");
  const mainTabs = document.getElementById("mainTabs");
  const workflowStep1 = document.getElementById("workflowStep1");
  const workflowStep2 = document.getElementById("workflowStep2");
  const STORAGE_KEYS = {
    selectedOldStepId: "bruhsailor:selectedOldStepId",
    catchupDoneStepIds: "bruhsailor:catchupDoneStepIds",
    legacyCatchupProgressByPlan: "bruhsailor:catchupProgress",
  };
  const state = {
    oldGuide: null,
    newGuide: null,
    mapping: null,
    oldLookup: new Map(),
    newLookup: new Map(),
    mappingByOldId: new Map(),
    mappingByNewId: new Map(),
    oldLinearSteps: [],
    newLinearSteps: [],
    oldOrderIndexById: new Map(),
    newOrderIndexById: new Map(),
    correspondingNewStep: null,
    selectedOldStepId: null,
    catchupDoneStepIds: new Set(),
    currentCatchupItems: [],
  };

  const CATEGORY_LABELS = {
    unchanged: "Unchanged",
    modified: "Modified",
    added: "Added",
    removed: "Removed",
    reordered: "Reordered",
  };

  function saveSelectedOldStepId(stepId) {
    try {
      localStorage.setItem(STORAGE_KEYS.selectedOldStepId, String(stepId || ""));
    } catch (error) {
      console.warn("Unable to save selected step in localStorage.", error);
    }
  }

  function loadSelectedOldStepId() {
    try {
      return localStorage.getItem(STORAGE_KEYS.selectedOldStepId);
    } catch (error) {
      console.warn("Unable to read selected step from localStorage.", error);
      return null;
    }
  }

  function loadCatchupDoneStepIds() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.catchupDoneStepIds);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return new Set(parsed.filter((item) => typeof item === "string"));
        }
      }

      // Backward compatibility: migrate legacy per-plan progress to global done IDs.
      const legacyRaw = localStorage.getItem(STORAGE_KEYS.legacyCatchupProgressByPlan);
      if (!legacyRaw) {
        return new Set();
      }

      const legacyParsed = JSON.parse(legacyRaw);
      if (!legacyParsed || typeof legacyParsed !== "object" || Array.isArray(legacyParsed)) {
        return new Set();
      }

      const done = new Set();
      Object.values(legacyParsed).forEach((value) => {
        if (!Array.isArray(value)) {
          return;
        }
        value.forEach((item) => {
          if (typeof item === "string") {
            done.add(item);
          }
        });
      });

      return done;
    } catch (error) {
      console.warn("Unable to read catch-up progress from localStorage.", error);
      return new Set();
    }
  }

  function saveCatchupDoneStepIds() {
    try {
      localStorage.setItem(
        STORAGE_KEYS.catchupDoneStepIds,
        JSON.stringify(Array.from(state.catchupDoneStepIds))
      );
    } catch (error) {
      console.warn("Unable to save catch-up progress to localStorage.", error);
    }
  }

  function getCheckedSet() {
    return new Set(state.catchupDoneStepIds);
  }

  function setCheckedStepDone(stepId, isChecked) {
    if (!stepId) {
      return;
    }

    if (isChecked) {
      state.catchupDoneStepIds.add(stepId);
    } else {
      state.catchupDoneStepIds.delete(stepId);
    }

    saveCatchupDoneStepIds();
  }

  function stripChapterPrefix(title) {
    return String(title || "Untitled chapter")
      .replace(/^chapter\s*\d+\s*:\s*/i, "")
      .trim();
  }

  function setCatchupStatusMessage(message) {
    if (!catchupStatus) {
      return;
    }

    if (message) {
      catchupStatus.hidden = false;
      catchupStatus.textContent = message;
    } else {
      catchupStatus.hidden = true;
      catchupStatus.textContent = "";
    }
  }

  function setStatusMessage(message) {
    const statusElement = document.getElementById("oldGuideStatus");
    if (!statusElement) {
      return;
    }
    statusElement.textContent = message;
  }

  function setDiffStatusMessage(message) {
    if (!diffStatus) {
      return;
    }

    if (message) {
      diffStatus.hidden = false;
      diffStatus.textContent = message;
    } else {
      diffStatus.hidden = true;
      diffStatus.textContent = "";
    }
  }

  function parseStepId(stepId) {
    const parts = String(stepId || "").split("-");
    return {
      chapter: parts[1] || "1",
      step: parts[2] || "1",
    };
  }

  function createGuideHref() {
    return "https://umkyzn.github.io/BRUHsailer/";
  }

  function updateCorrespondingLabel(stepId) {
    const parsed = parseStepId(stepId);
    correspondingStepLabel.textContent =
      "Corresponding new guide position: Chapter " + parsed.chapter + ", Step " + parsed.step;

    if (openGuideLink) {
      openGuideLink.href = createGuideHref();
    }

    if (appFooter) {
      appFooter.hidden = false;
    }
  }

  function setGuidanceState() {
    const hasSelection = Boolean(state.selectedOldStepId);
    const hasResolvedPlan = Boolean(state.selectedOldStepId && state.correspondingNewStep);
    if (oldPanel) {
      oldPanel.classList.toggle("needs-selection", !hasSelection);
    }

    if (catchupOnboarding) {
      catchupOnboarding.hidden = hasSelection;
    }

    if (planHelp) {
      planHelp.hidden = !hasSelection;
    }

    if (mainTabs) {
      mainTabs.hidden = !hasSelection;
    }

    if (rightPanel) {
      rightPanel.classList.toggle("is-locked", !hasSelection);
    }

    if (workflowStep1) {
      workflowStep1.classList.toggle("is-active", !hasSelection);
      workflowStep1.classList.toggle("is-complete", hasSelection);
    }

    if (workflowStep2) {
      workflowStep2.classList.toggle("is-active", hasSelection);
      workflowStep2.classList.remove("is-complete");
    }

    if (appFooter) {
      appFooter.hidden = !hasResolvedPlan;
    }

    if (jumpNextBtn) {
      jumpNextBtn.hidden = !hasResolvedPlan || state.currentCatchupItems.length === 0;
    }
  }

  function flashRightPanel() {
    if (!(rightPanel instanceof HTMLElement)) {
      return;
    }

    rightPanel.classList.remove("is-refreshed");
    void rightPanel.offsetWidth;
    rightPanel.classList.add("is-refreshed");
    window.setTimeout(() => {
      rightPanel.classList.remove("is-refreshed");
    }, 320);
  }

  function updateOldSelectionPillVisibility() {
    if (!(oldSelectionPill instanceof HTMLElement) || !oldGuideList) {
      return;
    }

    if (!state.selectedOldStepId) {
      oldSelectionPill.hidden = true;
      return;
    }

    const selectedStep = state.oldLookup.get(state.selectedOldStepId);
    if (selectedStep) {
      oldSelectionPill.textContent =
        "Currently at: Chapter " + selectedStep.chapter + ", Step " + selectedStep.number;
    }

    const selectedButton = oldGuideList.querySelector(
      '.old-step[data-step-id="' + state.selectedOldStepId + '"]'
    );

    if (!(selectedButton instanceof HTMLElement)) {
      oldSelectionPill.hidden = true;
      return;
    }

    const listRect = oldGuideList.getBoundingClientRect();
    const buttonRect = selectedButton.getBoundingClientRect();
    const isVisible = buttonRect.top >= listRect.top && buttonRect.bottom <= listRect.bottom;

    oldSelectionPill.hidden = isVisible;
  }

  function setCatchupCompletionState(isVisible, isAlreadyCaughtUp) {
    if (!catchupCompletion) {
      return;
    }

    if (!isVisible || !state.correspondingNewStep) {
      catchupCompletion.hidden = true;
      return;
    }

    const step = state.correspondingNewStep;
    const stepLabel = "Chapter " + step.chapter + ", Step " + step.number;
    const href = createGuideHref();

    catchupCompletion.hidden = false;

    if (catchupCompletionTitle) {
      catchupCompletionTitle.textContent = isAlreadyCaughtUp
        ? "You're already caught up!"
        : "You're caught up!";
    }

    if (catchupCompletionText) {
      catchupCompletionText.textContent = "Continue in the new guide at " + stepLabel + ".";
    }

    if (catchupCompletionLink) {
      catchupCompletionLink.href = href;
      catchupCompletionLink.textContent = "Open new guide";
    }
  }

  function groupStepsBySection(steps) {
    const groups = [];
    const map = new Map();

    steps.forEach((step) => {
      const sectionIndex =
        step && step.section && Number.isFinite(step.section.index) ? step.section.index : 0;
      const sectionTitle =
        step && step.section && step.section.title
          ? step.section.title
          : "Section " + (sectionIndex || 1);

      const key = sectionIndex + "::" + sectionTitle;
      if (!map.has(key)) {
        const group = {
          index: sectionIndex,
          title: sectionTitle,
          steps: [],
        };
        map.set(key, group);
        groups.push(group);
      }

      map.get(key).steps.push(step);
    });

    return groups;
  }

  function buildStepLookup(guide) {
    const lookup = new Map();
    if (!guide || !Array.isArray(guide.chapters)) {
      return lookup;
    }

    guide.chapters.forEach((chapter, chapterIndex) => {
      const steps = Array.isArray(chapter.steps) ? chapter.steps : [];
      steps.forEach((step) => {
        const displayText = step.displayText || step.text || "";
        const plainText = step.text || step.displayText || "";

        lookup.set(step.id, {
          id: step.id,
          chapter: chapterIndex + 1,
          number: step.number,
          text: displayText,
          plainText,
          sectionIndex:
            step && step.section && Number.isFinite(step.section.index)
              ? step.section.index
              : 0,
          sectionTitle:
            step && step.section && step.section.title
              ? step.section.title
              : "Section",
        });
      });
    });

    return lookup;
  }

  function buildLinearSteps(guide) {
    const linear = [];
    if (!guide || !Array.isArray(guide.chapters)) {
      return linear;
    }

    guide.chapters.forEach((chapter, chapterIndex) => {
      const steps = Array.isArray(chapter.steps) ? chapter.steps : [];
      steps.forEach((step) => {
        linear.push({
          id: step.id,
          chapter: chapterIndex + 1,
          number: step.number,
          text: step.displayText || step.text || "",
          sectionIndex:
            step && step.section && Number.isFinite(step.section.index)
              ? step.section.index
              : 0,
          sectionTitle:
            step && step.section && step.section.title
              ? step.section.title
              : "Section",
        });
      });
    });

    return linear;
  }

  function buildOrderIndexById(linearSteps) {
    const indexMap = new Map();
    linearSteps.forEach((step, index) => {
      indexMap.set(step.id, index);
    });
    return indexMap;
  }

  function buildMappingIndexes(mappings) {
    const byOld = new Map();
    const byNew = new Map();

    (mappings || []).forEach((entry) => {
      if (entry.oldId && !byOld.has(entry.oldId)) {
        byOld.set(entry.oldId, entry);
      }
      if (entry.newId && !byNew.has(entry.newId)) {
        byNew.set(entry.newId, entry);
      }
    });

    return { byOld, byNew };
  }

  function resolveCorrespondingNewStep(selectedOldStepId) {
    if (!selectedOldStepId || state.newLinearSteps.length === 0) {
      return null;
    }

    const directEntry = state.mappingByOldId.get(selectedOldStepId);
    if (directEntry && directEntry.newId && state.newLookup.has(directEntry.newId)) {
      return state.newLookup.get(directEntry.newId);
    }

    const selectedOldIndex = state.oldOrderIndexById.get(selectedOldStepId);
    if (!Number.isFinite(selectedOldIndex)) {
      return state.newLinearSteps[0] || null;
    }

    const candidates = [];
    (state.mapping && Array.isArray(state.mapping.mappings) ? state.mapping.mappings : []).forEach(
      (entry) => {
        if (!entry.oldId || !entry.newId) {
          return;
        }

        const oldIndex = state.oldOrderIndexById.get(entry.oldId);
        const newStep = state.newLookup.get(entry.newId);
        if (!Number.isFinite(oldIndex) || !newStep) {
          return;
        }

        candidates.push({
          distance: Math.abs(oldIndex - selectedOldIndex),
          preferBefore: oldIndex <= selectedOldIndex ? 0 : 1,
          newStep,
        });
      }
    );

    if (candidates.length === 0) {
      return state.newLinearSteps[0] || null;
    }

    candidates.sort((a, b) => {
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      return a.preferBefore - b.preferBefore;
    });

    return candidates[0].newStep;
  }

  function buildCatchupPlan(selectedOldStepId) {
    const empty = { correspondingNewStep: null, items: [] };
    if (!selectedOldStepId || !state.mapping || state.newLinearSteps.length === 0) {
      return empty;
    }

    const correspondingNewStep = resolveCorrespondingNewStep(selectedOldStepId);
    if (!correspondingNewStep) {
      return empty;
    }

    const selectedOldIndex = state.oldOrderIndexById.get(selectedOldStepId);
    const correspondingNewIndex = state.newOrderIndexById.get(correspondingNewStep.id);
    if (!Number.isFinite(correspondingNewIndex)) {
      return empty;
    }

    const items = [];
    state.newLinearSteps.forEach((newStep, newIndex) => {
      if (newIndex > correspondingNewIndex) {
        return;
      }

      const mappingEntry = state.mappingByNewId.get(newStep.id);
      if (!mappingEntry) {
        return;
      }

      const category = mappingEntry.category;
      if (category === "added") {
        items.push({
          newStep,
          category,
          reason: "New step in updated guide",
          oldStep: null,
        });
        return;
      }

      if (category === "modified") {
        if (!mappingEntry.oldId) {
          items.push({
            newStep,
            category,
            reason: "Modified step with no old equivalent",
            oldStep: null,
          });
          return;
        }

        const oldIndex = state.oldOrderIndexById.get(mappingEntry.oldId);
        if (Number.isFinite(oldIndex) && Number.isFinite(selectedOldIndex) && oldIndex < selectedOldIndex) {
          items.push({
            newStep,
            category,
            reason: "Modified - old version already done",
            oldStep: state.oldLookup.get(mappingEntry.oldId) || null,
          });
        }
        return;
      }

      if (category === "reordered") {
        if (!mappingEntry.oldId) {
          items.push({
            newStep,
            category,
            reason: "Reordered step with unclear old position",
            oldStep: null,
          });
          return;
        }

        const oldIndex = state.oldOrderIndexById.get(mappingEntry.oldId);
        if (!Number.isFinite(oldIndex) || !Number.isFinite(selectedOldIndex) || oldIndex >= selectedOldIndex) {
          const oldStep = state.oldLookup.get(mappingEntry.oldId) || null;
          const reason = oldStep
            ? "Reordered from Chapter " + oldStep.chapter + " Step " + oldStep.number
            : "Reordered step";

          items.push({
            newStep,
            category,
            reason,
            oldStep,
          });
        }
      }
    });

    return {
      correspondingNewStep,
      items,
    };
  }

  function setCatchupCardCheckedState(card, isChecked) {
    if (!(card instanceof HTMLElement)) {
      return;
    }

    card.classList.toggle("is-complete", isChecked);
    card.classList.toggle("is-collapsed", isChecked);
  }

  function updateCatchupProgressSummary() {
    if (!catchupSummary) {
      return;
    }

    const total = state.currentCatchupItems.length;
    const checkedSet = getCheckedSet();
    let completed = 0;
    state.currentCatchupItems.forEach((item) => {
      if (checkedSet.has(item.newStep.id)) {
        completed += 1;
      }
    });

    const hasSelection = Boolean(state.selectedOldStepId && state.correspondingNewStep);
    catchupSummary.hidden = !hasSelection || total === 0;

    if (!catchupSummary.hidden) {
      catchupSummary.textContent = completed + " / " + total + " completed";
    }

    const isComplete = total === 0 || completed === total;
    const isAlreadyCaughtUp = total === 0;

    catchupSummary.classList.toggle("is-complete", isComplete);
    setCatchupCompletionState(isComplete, isAlreadyCaughtUp);
  }

  function renderCatchupPlan(planResult) {
    if (!catchupList || !catchupSummary) {
      return;
    }

    catchupList.innerHTML = "";
    state.currentCatchupItems = [];
    setCatchupCompletionState(false, false);

    if (!planResult || !planResult.correspondingNewStep) {
      setCatchupStatusMessage(null);
      catchupSummary.hidden = true;
      catchupSummary.classList.remove("is-complete");
      setGuidanceState();
      return;
    }

    const items = planResult.items || [];
    state.currentCatchupItems = items;

    if (items.length === 0) {
      setCatchupStatusMessage("No transition steps needed before this resume point.");
      updateCatchupProgressSummary();
      setGuidanceState();
      return;
    }

    const checkedSet = getCheckedSet();
    setCatchupStatusMessage(null);

    items.forEach((item) => {
      const listItem = document.createElement("li");
      listItem.className = "plan-item diff-item diff-" + item.category + " plan-" + item.category;
      listItem.dataset.newStepId = item.newStep.id;

      const head = document.createElement("div");
      head.className = "plan-item-head";

      const headLeft = document.createElement("div");
      headLeft.className = "plan-item-head-left";

      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = CATEGORY_LABELS[item.category] || item.category;

      const summary = document.createElement("p");
      summary.className = "plan-item-summary";
      summary.textContent = item.reason;

      const stepMeta = document.createElement("p");
      stepMeta.className = "plan-item-step";
      stepMeta.textContent = "C" + item.newStep.chapter + " S" + item.newStep.number;

      const checkWrap = document.createElement("label");
      checkWrap.className = "plan-item-check-wrap";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "plan-item-checkbox";
      checkbox.dataset.newStepId = item.newStep.id;
      checkbox.checked = checkedSet.has(item.newStep.id);

      const checkLabel = document.createElement("span");
      checkLabel.className = "plan-item-check-label";
      checkLabel.textContent = "Done";

      headLeft.appendChild(badge);
      headLeft.appendChild(summary);
      checkWrap.appendChild(checkbox);
      checkWrap.appendChild(checkLabel);

      const headRight = document.createElement("div");
      headRight.className = "plan-item-head-right";
      headRight.appendChild(stepMeta);
      headRight.appendChild(checkWrap);

      head.appendChild(headLeft);
      head.appendChild(headRight);

      const body = document.createElement("div");
      body.className = "plan-item-body";

      const newDisplayText = item.newStep ? item.newStep.text || item.newStep.displayText || "" : "";
      const oldDiffText = item.oldStep ? item.oldStep.text || item.oldStep.displayText || "" : "";
      const newDiffText = item.newStep ? item.newStep.text || item.newStep.displayText || "" : "";
      const tokenDiff = buildWordDiffTokens(oldDiffText, newDiffText);

      if (item.oldStep) {
        body.appendChild(createDiffTokenLine("Old", tokenDiff.oldTokens));
      } else {
        body.appendChild(createDiffLine("Old", "(none)"));
      }

      if (!item.oldStep) {
        body.appendChild(createDiffLine("New", newDisplayText));
      } else {
        body.appendChild(createDiffTokenLine("New", tokenDiff.newTokens));
      }

      listItem.appendChild(head);
      listItem.appendChild(body);

      setCatchupCardCheckedState(listItem, checkbox.checked);

      catchupList.appendChild(listItem);
    });

    updateCatchupProgressSummary();
    setGuidanceState();
  }

  function updateCatchupFromSelection() {
    const planResult = buildCatchupPlan(state.selectedOldStepId);
    state.correspondingNewStep = planResult.correspondingNewStep;

    if (planResult.correspondingNewStep) {
      updateCorrespondingLabel(
        "new-" + planResult.correspondingNewStep.chapter + "-" + planResult.correspondingNewStep.number
      );
    } else if (appFooter) {
      appFooter.hidden = true;
    }

    renderCatchupPlan(planResult);
    updateOldSelectionPillVisibility();
    flashRightPanel();
  }

  function setSelectedOldStep(stepId) {
    const oldStepButtons = Array.from(oldGuideList.querySelectorAll(".old-step"));
    let selectedButton = null;

    oldStepButtons.forEach((button) => {
      const isSelected = button.dataset.stepId === stepId;
      button.classList.toggle("is-selected", isSelected);
      if (isSelected) {
        selectedButton = button;
        button.setAttribute("aria-current", "step");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    if (selectedButton instanceof HTMLElement) {
      const subchapterBlock = selectedButton.closest(".subchapter-block");
      if (subchapterBlock instanceof HTMLElement) {
        subchapterBlock.classList.remove("is-collapsed");
        const subchapterToggle = subchapterBlock.querySelector(".old-subchapter-toggle");
        if (subchapterToggle instanceof HTMLElement) {
          subchapterToggle.setAttribute("aria-expanded", "true");
        }
      }

      const chapterBlock = selectedButton.closest(".chapter-block");
      if (chapterBlock instanceof HTMLElement) {
        chapterBlock.classList.remove("is-collapsed");
        const chapterToggle = chapterBlock.querySelector(".old-chapter-toggle");
        if (chapterToggle instanceof HTMLElement) {
          chapterToggle.setAttribute("aria-expanded", "true");
        }
      }
    }

    state.selectedOldStepId = stepId;
    saveSelectedOldStepId(stepId);

    activateTab("catchupView");

    if (state.mapping && state.newLinearSteps.length > 0) {
      updateCatchupFromSelection();
    }

    if (window.matchMedia("(max-width: 980px)").matches) {
      const catchupPanel = document.getElementById("catchupView");
      if (catchupPanel instanceof HTMLElement) {
        catchupPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    setGuidanceState();
  }

  function renderOldGuideChapters() {
    if (!state.oldGuide || !Array.isArray(state.oldGuide.chapters)) {
      setStatusMessage("No old guide data found.");
      return;
    }

    oldGuideList.innerHTML = "";

    state.oldGuide.chapters.forEach((chapter, chapterIndex) => {
      const chapterBlock = document.createElement("section");
      chapterBlock.className = "chapter-block";

      const chapterToggle = document.createElement("button");
      chapterToggle.type = "button";
      chapterToggle.className = "chapter-toggle old-chapter-toggle";
      chapterToggle.dataset.chapterIndex = String(chapterIndex);
      chapterToggle.setAttribute("aria-expanded", "true");

      const chapterTitle = document.createElement("span");
      chapterTitle.className = "chapter-title";
      chapterTitle.textContent =
        "Ch." + (chapterIndex + 1) + " - " + stripChapterPrefix(chapter.title);

      const chapterMeta = document.createElement("span");
      chapterMeta.className = "chapter-meta";
      chapterMeta.textContent = (chapter.steps || []).length + " steps";

      const chapterChevron = document.createElement("span");
      chapterChevron.className = "chapter-chevron";
      chapterChevron.setAttribute("aria-hidden", "true");
      chapterChevron.textContent = "▾";

      chapterToggle.appendChild(chapterTitle);
      chapterToggle.appendChild(chapterMeta);
      chapterToggle.appendChild(chapterChevron);

      const stepsWrap = document.createElement("div");
      stepsWrap.className = "chapter-steps-wrap";
      const steps = Array.isArray(chapter.steps) ? chapter.steps : [];
      const sectionGroups = groupStepsBySection(steps);

      sectionGroups.forEach((sectionGroup) => {
        const subchapterBlock = document.createElement("section");
        subchapterBlock.className = "subchapter-block is-collapsed";

        const subchapterToggle = document.createElement("button");
        subchapterToggle.type = "button";
        subchapterToggle.className = "subchapter-toggle old-subchapter-toggle";
        subchapterToggle.setAttribute("aria-expanded", "false");

        const subchapterTitle = document.createElement("span");
        subchapterTitle.className = "subchapter-title";
        subchapterTitle.textContent = sectionGroup.title;

        const subchapterMeta = document.createElement("span");
        subchapterMeta.className = "subchapter-meta";
        subchapterMeta.textContent = sectionGroup.steps.length + " steps";

        const subchapterChevron = document.createElement("span");
        subchapterChevron.className = "subchapter-chevron";
        subchapterChevron.setAttribute("aria-hidden", "true");
        subchapterChevron.textContent = "▾";

        subchapterToggle.appendChild(subchapterTitle);
        subchapterToggle.appendChild(subchapterMeta);
        subchapterToggle.appendChild(subchapterChevron);

        const subchapterStepsWrap = document.createElement("div");
        subchapterStepsWrap.className = "subchapter-steps-wrap";

        const list = document.createElement("ul");

        sectionGroup.steps.forEach((step) => {
          const listItem = document.createElement("li");
          const stepButton = document.createElement("button");

          stepButton.type = "button";
          stepButton.className = "old-step";
          stepButton.dataset.stepId = step.id;
          stepButton.dataset.chapterIndex = String(chapterIndex);

          const label = document.createElement("span");
          label.className = "old-step-label";
          label.textContent = "Step " + step.number;

          stepButton.appendChild(label);
          listItem.appendChild(stepButton);
          list.appendChild(listItem);
        });

        subchapterStepsWrap.appendChild(list);
        subchapterBlock.appendChild(subchapterToggle);
        subchapterBlock.appendChild(subchapterStepsWrap);
        stepsWrap.appendChild(subchapterBlock);
      });

      chapterBlock.appendChild(chapterToggle);
      chapterBlock.appendChild(stepsWrap);
      oldGuideList.appendChild(chapterBlock);
    });

    const restoredStepId = loadSelectedOldStepId();
    const restoredButton = restoredStepId
      ? oldGuideList.querySelector('.old-step[data-step-id="' + restoredStepId + '"]')
      : null;

    if (restoredButton instanceof HTMLElement) {
      setSelectedOldStep(restoredStepId);
      return;
    }

    state.selectedOldStepId = null;
    state.correspondingNewStep = null;
    renderCatchupPlan({ correspondingNewStep: null, items: [] });
    setGuidanceState();
    updateOldSelectionPillVisibility();
  }

  function createDiffLine(label, text, className) {
    const paragraph = document.createElement("p");
    paragraph.className = "diff-line" + (className ? " " + className : "");

    const strong = document.createElement("strong");
    strong.textContent = label + ": ";
    paragraph.appendChild(strong);
    paragraph.appendChild(document.createTextNode(text));

    return paragraph;
  }

  function tokenizeWithWhitespace(text) {
    const source = String(text || "").replace(/\r\n?/g, "\n");
    const rawTokens = source.match(/\n|[^\S\n]+|[^\s]+/g) || [];

    const tokens = [];
    const wordIndexes = [];

    rawTokens.forEach((rawToken) => {
      if (rawToken === "\n" || /^[^\S\n]+$/.test(rawToken)) {
        tokens.push({ type: "ws", value: rawToken });
      } else {
        tokens.push({ type: "word", value: rawToken, status: "common" });
        wordIndexes.push(tokens.length - 1);
      }
    });

    return { tokens, wordIndexes };
  }

  function buildWordDiffTokens(oldText, newText) {
    const oldTokenized = tokenizeWithWhitespace(oldText);
    const newTokenized = tokenizeWithWhitespace(newText);

    const oldWords = oldTokenized.wordIndexes.map((index) =>
      oldTokenized.tokens[index].value.toLowerCase()
    );
    const newWords = newTokenized.wordIndexes.map((index) =>
      newTokenized.tokens[index].value.toLowerCase()
    );

    const rows = oldWords.length + 1;
    const cols = newWords.length + 1;
    const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let i = 1; i < rows; i += 1) {
      for (let j = 1; j < cols; j += 1) {
        if (oldWords[i - 1] === newWords[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const commonOld = new Set();
    const commonNew = new Set();
    let i = oldWords.length;
    let j = newWords.length;

    while (i > 0 && j > 0) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        commonOld.add(i - 1);
        commonNew.add(j - 1);
        i -= 1;
        j -= 1;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        i -= 1;
      } else {
        j -= 1;
      }
    }

    oldTokenized.wordIndexes.forEach((tokenIndex, wordIndex) => {
      if (!commonOld.has(wordIndex)) {
        oldTokenized.tokens[tokenIndex].status = "remove";
      }
    });

    newTokenized.wordIndexes.forEach((tokenIndex, wordIndex) => {
      if (!commonNew.has(wordIndex)) {
        newTokenized.tokens[tokenIndex].status = "add";
      }
    });

    return {
      oldTokens: oldTokenized.tokens,
      newTokens: newTokenized.tokens,
    };
  }

  function createDiffTokenLine(label, tokens) {
    const paragraph = document.createElement("p");
    paragraph.className = "diff-line diff-token-line";

    const strong = document.createElement("strong");
    strong.textContent = label + ": ";
    paragraph.appendChild(strong);

    const tokenContainer = document.createElement("span");
    tokenContainer.className = "diff-token-container";

    tokens.forEach((segment) => {
      if (segment.type === "ws") {
        tokenContainer.appendChild(document.createTextNode(segment.value));
        return;
      }

      const token = document.createElement("span");
      token.className = "diff-token";
      token.textContent = segment.value;

      if (segment.status === "add") {
        token.classList.add("is-added");
      } else if (segment.status === "remove") {
        token.classList.add("is-removed");
      }

      tokenContainer.appendChild(token);
    });

    paragraph.appendChild(tokenContainer);
    return paragraph;
  }

  function getMappingEntryContext(mappingEntry) {
    const oldStep = mappingEntry.oldId ? state.oldLookup.get(mappingEntry.oldId) : null;
    const newStep = mappingEntry.newId ? state.newLookup.get(mappingEntry.newId) : null;
    const sectionReference = newStep || oldStep;

    return {
      oldStep,
      newStep,
      chapter: sectionReference ? sectionReference.chapter : mappingEntry.chapter || 1,
      sectionIndex: sectionReference ? sectionReference.sectionIndex : 0,
      sectionTitle: sectionReference ? sectionReference.sectionTitle : "Ungrouped",
    };
  }

  function createDiffSummary(mappingEntry, oldStep, newStep) {
    const category = mappingEntry.category || "unchanged";
    if (category === "added") {
      return "New step";
    }
    if (category === "removed") {
      return "Removed from new guide";
    }
    if (category === "reordered") {
      return "Step moved position";
    }
    if (category === "modified") {
      return "Step instructions changed";
    }

    const referenceStep = newStep || oldStep;
    return referenceStep ? "Step " + referenceStep.number : "Unchanged";
  }

  function createDiffItem(mappingEntry) {
    const category = mappingEntry.category || "unchanged";
    const context = getMappingEntryContext(mappingEntry);
    const oldStep = context.oldStep;
    const newStep = context.newStep;

    const item = document.createElement("li");
    item.className = "diff-item diff-" + category + " " + category + " is-collapsed";

    const itemToggle = document.createElement("button");
    itemToggle.type = "button";
    itemToggle.className = "diff-item-toggle";
    itemToggle.setAttribute("aria-expanded", "false");

    const itemHead = document.createElement("div");
    itemHead.className = "diff-item-head";

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = CATEGORY_LABELS[category] || category;

    const meta = document.createElement("p");
    meta.className = "diff-item-meta";
    const oldPos = oldStep ? "Old C" + oldStep.chapter + " S" + oldStep.number : "Old -";
    const newPos = newStep ? "New C" + newStep.chapter + " S" + newStep.number : "New -";
    meta.textContent = oldPos + " -> " + newPos;

    const summary = document.createElement("p");
    summary.className = "diff-item-summary";
    summary.textContent = createDiffSummary(mappingEntry, oldStep, newStep);

    const itemChevron = document.createElement("span");
    itemChevron.className = "diff-item-chevron";
    itemChevron.setAttribute("aria-hidden", "true");
    itemChevron.textContent = "▾";

    itemHead.appendChild(badge);
    itemHead.appendChild(meta);
    itemToggle.appendChild(itemHead);
    itemToggle.appendChild(summary);
    itemToggle.appendChild(itemChevron);

    const itemBody = document.createElement("div");
    itemBody.className = "diff-item-body";

    if (category === "unchanged") {
      const unchangedText = newStep ? newStep.text : oldStep ? oldStep.text : "No text available";
      itemBody.appendChild(createDiffLine("Step", unchangedText));
    } else if (category === "modified") {
      const oldDiffText = oldStep ? oldStep.text : "";
      const newDiffText = newStep ? newStep.text : "";
      const tokenDiff = buildWordDiffTokens(oldDiffText, newDiffText);
      itemBody.appendChild(createDiffTokenLine("Old", tokenDiff.oldTokens));
      itemBody.appendChild(createDiffTokenLine("New", tokenDiff.newTokens));
    } else if (category === "added") {
      const addedText = newStep ? newStep.text : "No new step text available";
      itemBody.appendChild(createDiffLine("New", addedText));
    } else if (category === "removed") {
      const removedText = oldStep ? oldStep.text : "No old step text available";
      itemBody.appendChild(createDiffLine("Old", removedText, "is-removed"));
    } else if (category === "reordered") {
      const movedText = newStep ? newStep.text : oldStep ? oldStep.text : "No step text available";
      itemBody.appendChild(createDiffLine("Step", movedText));
      if (oldStep) {
        itemBody.appendChild(
          createDiffLine(
            "Moved from",
            "Chapter " + oldStep.chapter + " Step " + oldStep.number
          )
        );
      }
    }

    item.appendChild(itemToggle);
    item.appendChild(itemBody);

    return item;
  }

  function renderDiffView() {
    if (!state.mapping || !Array.isArray(state.mapping.mappings)) {
      setDiffStatusMessage("No mapping data found.");
      return;
    }

    if (!diffContent) {
      return;
    }

    diffContent.innerHTML = "";

    const chapterStats = Array.isArray(state.mapping.chapterStats)
      ? state.mapping.chapterStats
      : [];

    const chapterGroups = new Map();
    chapterStats.forEach((chapterStat) => {
      chapterGroups.set(chapterStat.chapter, {
        chapter: chapterStat.chapter,
        title: chapterStat.title,
        counts: chapterStat.counts,
        hasPresetCounts: true,
        sectionGroups: new Map(),
      });
    });

    state.mapping.mappings.forEach((mappingEntry) => {
      const context = getMappingEntryContext(mappingEntry);
      if (!chapterGroups.has(context.chapter)) {
        chapterGroups.set(context.chapter, {
          chapter: context.chapter,
          title: "Chapter " + context.chapter,
          counts: {
            unchanged: 0,
            modified: 0,
            added: 0,
            removed: 0,
            reordered: 0,
          },
          hasPresetCounts: false,
          sectionGroups: new Map(),
        });
      }

      const chapterGroup = chapterGroups.get(context.chapter);
      if (!chapterGroup.hasPresetCounts && chapterGroup.counts[mappingEntry.category] !== undefined) {
        chapterGroup.counts[mappingEntry.category] += 1;
      }

      const sectionKey = context.sectionIndex + "::" + context.sectionTitle;
      if (!chapterGroup.sectionGroups.has(sectionKey)) {
        chapterGroup.sectionGroups.set(sectionKey, {
          index: context.sectionIndex,
          title: context.sectionTitle,
          entries: [],
        });
      }

      chapterGroup.sectionGroups.get(sectionKey).entries.push(mappingEntry);
    });

    const orderedChapters = Array.from(chapterGroups.values()).sort((a, b) => a.chapter - b.chapter);

    orderedChapters.forEach((chapter) => {
      const chapterBox = document.createElement("section");
      chapterBox.className = "diff-chapter";

      const chapterToggle = document.createElement("button");
      chapterToggle.type = "button";
      chapterToggle.className = "chapter-toggle diff-chapter-toggle";
      chapterToggle.setAttribute("aria-expanded", "true");

      const title = document.createElement("h3");
      title.className = "diff-chapter-title";
      title.textContent = "Chapter " + chapter.chapter + " - " + stripChapterPrefix(chapter.title);

      const counts = document.createElement("p");
      counts.className = "diff-chapter-counts";
      counts.textContent =
        "U " +
        chapter.counts.unchanged +
        " | M " +
        chapter.counts.modified +
        " | A " +
        chapter.counts.added +
        " | Rm " +
        chapter.counts.removed +
        " | Ro " +
        chapter.counts.reordered;

      const chapterChevron = document.createElement("span");
      chapterChevron.className = "chapter-chevron";
      chapterChevron.setAttribute("aria-hidden", "true");
      chapterChevron.textContent = "▾";

      chapterToggle.appendChild(title);
      chapterToggle.appendChild(counts);
      chapterToggle.appendChild(chapterChevron);

      const chapterBody = document.createElement("div");
      chapterBody.className = "chapter-steps-wrap";

      const orderedSections = Array.from(chapter.sectionGroups.values()).sort((a, b) => {
        if (a.index !== b.index) {
          return a.index - b.index;
        }
        return String(a.title).localeCompare(String(b.title));
      });

      orderedSections.forEach((section) => {
        const sectionBox = document.createElement("section");
        sectionBox.className = "subchapter-block is-collapsed";

        const sectionToggle = document.createElement("button");
        sectionToggle.type = "button";
        sectionToggle.className = "subchapter-toggle diff-subchapter-toggle";
        sectionToggle.setAttribute("aria-expanded", "false");

        const sectionTitle = document.createElement("span");
        sectionTitle.className = "subchapter-title";
        sectionTitle.textContent = section.title;

        const sectionMeta = document.createElement("span");
        sectionMeta.className = "subchapter-meta";
        sectionMeta.textContent = section.entries.length + " changes";

        const sectionChevron = document.createElement("span");
        sectionChevron.className = "subchapter-chevron";
        sectionChevron.setAttribute("aria-hidden", "true");
        sectionChevron.textContent = "▾";

        sectionToggle.appendChild(sectionTitle);
        sectionToggle.appendChild(sectionMeta);
        sectionToggle.appendChild(sectionChevron);

        const sectionBody = document.createElement("div");
        sectionBody.className = "subchapter-steps-wrap";

        const list = document.createElement("ul");
        list.className = "diff-list";

        section.entries.forEach((entry) => {
          list.appendChild(createDiffItem(entry));
        });

        sectionBody.appendChild(list);
        sectionBox.appendChild(sectionToggle);
        sectionBox.appendChild(sectionBody);
        chapterBody.appendChild(sectionBox);
      });

      chapterBox.appendChild(chapterToggle);
      chapterBox.appendChild(chapterBody);
      diffContent.appendChild(chapterBox);
    });

    setDiffStatusMessage(null);
  }

  async function loadAllData() {
    try {
      state.catchupDoneStepIds = loadCatchupDoneStepIds();

      const [oldResponse, newResponse, mappingResponse] = await Promise.all([
        fetch("data/old-guide.json"),
        fetch("data/new-guide.json"),
        fetch("data/mapping.json"),
      ]);

      if (!oldResponse.ok || !newResponse.ok || !mappingResponse.ok) {
        throw new Error("Unable to load one or more data files.");
      }

      const [oldGuide, newGuide, mapping] = await Promise.all([
        oldResponse.json(),
        newResponse.json(),
        mappingResponse.json(),
      ]);

      state.oldGuide = oldGuide;
      state.newGuide = newGuide;
      state.mapping = mapping;
      state.oldLookup = buildStepLookup(oldGuide);
      state.newLookup = buildStepLookup(newGuide);
      state.oldLinearSteps = buildLinearSteps(oldGuide);
      state.newLinearSteps = buildLinearSteps(newGuide);
      state.oldOrderIndexById = buildOrderIndexById(state.oldLinearSteps);
      state.newOrderIndexById = buildOrderIndexById(state.newLinearSteps);

      const mappingIndexes = buildMappingIndexes(mapping.mappings);
      state.mappingByOldId = mappingIndexes.byOld;
      state.mappingByNewId = mappingIndexes.byNew;

      renderOldGuideChapters();
      renderDiffView();
    } catch (error) {
      const fallbackMessage =
        window.location.protocol === "file:"
          ? "Could not load JSON from file://. Start a local server (for example: python -m http.server) and reopen this page."
          : "Could not load guide data. Check that data files exist in the data folder.";

      oldGuideList.innerHTML = '<p class="info-note" id="oldGuideStatus"></p>';
      const recreatedStatus = document.getElementById("oldGuideStatus");
      if (recreatedStatus) {
        recreatedStatus.textContent = fallbackMessage;
      }

      setDiffStatusMessage(fallbackMessage);
      setCatchupStatusMessage(fallbackMessage);
      console.error(error);
    }
  }

  function activateTab(targetId) {
    tabButtons.forEach((button) => {
      const isActive = button.dataset.tabTarget === targetId;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    tabPanels.forEach((panel) => {
      const isActive = panel.id === targetId;
      panel.classList.toggle("is-active", isActive);
    });
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.tabTarget);
    });
  });

  oldGuideList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const stepButton = target.closest(".old-step");
    if (stepButton instanceof HTMLElement) {
      const stepId = stepButton.dataset.stepId;
      if (stepId) {
        setSelectedOldStep(stepId);
      }
      return;
    }

    const subchapterToggle = target.closest(".old-subchapter-toggle");
    if (subchapterToggle instanceof HTMLElement) {
      const subchapterBlock = subchapterToggle.closest(".subchapter-block");
      if (subchapterBlock instanceof HTMLElement) {
        subchapterBlock.classList.toggle("is-collapsed");
        const isExpanded = !subchapterBlock.classList.contains("is-collapsed");
        subchapterToggle.setAttribute("aria-expanded", String(isExpanded));
      }
      return;
    }

    const chapterToggle = target.closest(".old-chapter-toggle");
    if (!(chapterToggle instanceof HTMLElement)) {
      return;
    }

    const chapterBlock = chapterToggle.closest(".chapter-block");
    if (!(chapterBlock instanceof HTMLElement)) {
      return;
    }

    chapterBlock.classList.toggle("is-collapsed");
    const isExpanded = !chapterBlock.classList.contains("is-collapsed");
    chapterToggle.setAttribute("aria-expanded", String(isExpanded));
  });

  diffContent.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const diffItemToggle = target.closest(".diff-item-toggle");
    if (diffItemToggle instanceof HTMLElement) {
      const diffItem = diffItemToggle.closest(".diff-item");
      if (diffItem instanceof HTMLElement) {
        diffItem.classList.toggle("is-collapsed");
        const isExpanded = !diffItem.classList.contains("is-collapsed");
        diffItemToggle.setAttribute("aria-expanded", String(isExpanded));
      }
      return;
    }

    const diffSubchapterToggle = target.closest(".diff-subchapter-toggle");
    if (diffSubchapterToggle instanceof HTMLElement) {
      const subchapterBlock = diffSubchapterToggle.closest(".subchapter-block");
      if (subchapterBlock instanceof HTMLElement) {
        subchapterBlock.classList.toggle("is-collapsed");
        const isExpanded = !subchapterBlock.classList.contains("is-collapsed");
        diffSubchapterToggle.setAttribute("aria-expanded", String(isExpanded));
      }
      return;
    }

    const diffChapterToggle = target.closest(".diff-chapter-toggle");
    if (!(diffChapterToggle instanceof HTMLElement)) {
      return;
    }

    const chapterBlock = diffChapterToggle.closest(".diff-chapter");
    if (!(chapterBlock instanceof HTMLElement)) {
      return;
    }

    chapterBlock.classList.toggle("is-collapsed");
    const isExpanded = !chapterBlock.classList.contains("is-collapsed");
    diffChapterToggle.setAttribute("aria-expanded", String(isExpanded));
  });

  catchupList.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (!target.classList.contains("plan-item-checkbox")) {
      return;
    }

    const stepId = target.dataset.newStepId;
    if (!stepId) {
      return;
    }

    setCheckedStepDone(stepId, target.checked);

    const card = target.closest(".plan-item");
    setCatchupCardCheckedState(card, target.checked);

    updateCatchupProgressSummary();
    setGuidanceState();
  });

  oldGuideList.addEventListener("scroll", () => {
    updateOldSelectionPillVisibility();
  });

  window.addEventListener("resize", () => {
    updateOldSelectionPillVisibility();
  });

  if (jumpNextBtn) {
    jumpNextBtn.addEventListener("click", () => {
      activateTab("catchupView");

      const nextCard = catchupList.querySelector(".plan-item:not(.is-complete)");
      if (!(nextCard instanceof HTMLElement)) {
        return;
      }

      nextCard.classList.remove("is-collapsed");
      nextCard.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  setGuidanceState();

  loadAllData();
})();
