const storageKey = "group-kanban-state-v1";
const authKey = "fine-road-auth-v1";
const loginCredentials = {
  id: "fine",
  password: "road",
};
const groupCount = 4;
const defaultGroups = Array.from({ length: groupCount }, (_, index) => ({
  id: `group-${index + 1}`,
  title: `${index + 1}조`,
  members: [],
}));

let state = loadState();
let draggedCardId = null;

const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const loginForm = document.querySelector("#loginForm");
const loginId = document.querySelector("#loginId");
const loginPassword = document.querySelector("#loginPassword");
const loginError = document.querySelector("#loginError");
const board = document.querySelector("#board");
const nameForm = document.querySelector("#nameForm");
const nameInput = document.querySelector("#nameInput");
const totalCount = document.querySelector("#totalCount");
const balanceText = document.querySelector("#balanceText");
const shuffleButton = document.querySelector("#shuffleButton");
const clearButton = document.querySelector("#clearButton");
const logoutButton = document.querySelector("#logoutButton");
const groupTemplate = document.querySelector("#groupTemplate");
const cardTemplate = document.querySelector("#cardTemplate");

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = loginId.value.trim();
  const password = loginPassword.value;

  if (id !== loginCredentials.id || password !== loginCredentials.password) {
    loginError.textContent = "아이디 또는 비밀번호가 맞지 않습니다.";
    loginPassword.value = "";
    loginPassword.focus();
    return;
  }

  sessionStorage.setItem(authKey, "signed-in");
  loginError.textContent = "";
  loginPassword.value = "";
  showApp();
});

logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem(authKey);
  showLogin();
});

nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const names = parseNames(nameInput.value);
  if (names.length === 0) return;

  names.forEach((name) => {
    const targetGroup = getSmallestGroup();
    targetGroup.members.push({
      id: crypto.randomUUID(),
      name,
    });
  });

  nameInput.value = "";
  persistAndRender();
});

shuffleButton.addEventListener("click", () => {
  const members = shuffle(getAllMembers());
  state.groups.forEach((group) => {
    group.members = [];
  });

  members.forEach((member, index) => {
    state.groups[index % groupCount].members.push(member);
  });

  persistAndRender();
});

clearButton.addEventListener("click", () => {
  if (getAllMembers().length === 0) return;
  const shouldClear = confirm("모든 이름을 지울까요?");
  if (!shouldClear) return;

  state.groups.forEach((group) => {
    group.members = [];
  });
  persistAndRender();
});

function render() {
  board.innerHTML = "";

  state.groups.forEach((group) => {
    const column = groupTemplate.content.firstElementChild.cloneNode(true);
    const title = column.querySelector(".group-title");
    const count = column.querySelector(".group-count");
    const dropZone = column.querySelector(".drop-zone");

    title.value = group.title;
    title.addEventListener("input", () => {
      group.title = title.value.trim() || `${state.groups.indexOf(group) + 1}조`;
      saveState();
    });

    count.textContent = `${group.members.length}명`;
    dropZone.dataset.groupId = group.id;
    wireDropZone(dropZone);

    group.members.forEach((member, index) => {
      const roles = {
        isLead: index === 0,
        isTail: index === group.members.length - 1,
      };
      dropZone.append(createCard(member, roles));
    });

    board.append(column);
  });

  renderSummary();
}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
  render();
  nameInput.focus();
}

function showLogin() {
  appView.hidden = true;
  loginView.hidden = false;
  loginId.focus();
}

function createCard(member, roles) {
  const card = cardTemplate.content.firstElementChild.cloneNode(true);
  const name = card.querySelector(".card-name");
  const badges = card.querySelector(".card-badges");
  const deleteButton = card.querySelector(".delete-card");

  card.dataset.cardId = member.id;
  name.value = member.name;
  badges.replaceChildren(...createRoleBadges(roles));

  card.addEventListener("dragstart", (event) => {
    draggedCardId = member.id;
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", member.id);
  });

  card.addEventListener("dragend", () => {
    draggedCardId = null;
    card.classList.remove("dragging");
    document.querySelectorAll(".drag-over").forEach((zone) => zone.classList.remove("drag-over"));
  });

  name.addEventListener("input", () => {
    member.name = name.value.trim();
    saveState();
  });

  name.addEventListener("keydown", (event) => {
    if (event.key === "Enter") name.blur();
  });

  deleteButton.addEventListener("click", () => {
    removeMember(member.id);
    persistAndRender();
  });

  return card;
}

function createRoleBadges({ isLead, isTail }) {
  const badges = [];
  if (isLead) badges.push(createRoleBadge("lead", "리딩", createLeadIcon()));
  if (isTail) badges.push(createRoleBadge("tail", "후미", createTailIcon()));
  return badges;
}

function createRoleBadge(role, label, iconSvg) {
  const badge = document.createElement("span");
  badge.className = "role-badge";
  badge.dataset.role = role;
  badge.setAttribute("aria-label", label);
  badge.innerHTML = `${iconSvg}<span>${label}</span>`;
  return badge;
}

function createLeadIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M5 21V4" />
      <path d="M5 4h12l-2 4 2 4H5" />
    </svg>
  `;
}

function createTailIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M19 3v18" />
      <path d="M19 17H7" />
      <path d="m11 13-4 4 4 4" />
    </svg>
  `;
}

function wireDropZone(dropZone) {
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });

  dropZone.addEventListener("dragleave", (event) => {
    if (!dropZone.contains(event.relatedTarget)) {
      dropZone.classList.remove("drag-over");
    }
  });

  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    const memberId = event.dataTransfer.getData("text/plain") || draggedCardId;
    const targetGroupId = dropZone.dataset.groupId;
    const targetIndex = getDropIndex(dropZone, event.clientY);
    moveMember(memberId, targetGroupId, targetIndex);
    persistAndRender();
  });
}

function parseNames(value) {
  return value
    .split(/[\n,]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function getSmallestGroup() {
  return [...state.groups].sort((a, b) => a.members.length - b.members.length)[0];
}

function getAllMembers() {
  return state.groups.flatMap((group) => group.members);
}

function getDropIndex(dropZone, pointerY) {
  const cards = [...dropZone.querySelectorAll(".name-card:not(.dragging)")];
  const targetCard = cards.find((card) => {
    const rect = card.getBoundingClientRect();
    return pointerY < rect.top + rect.height / 2;
  });

  return targetCard ? cards.indexOf(targetCard) : cards.length;
}

function moveMember(memberId, targetGroupId, targetIndex) {
  if (!memberId || !targetGroupId) return;

  let movingMember = null;
  state.groups.forEach((group) => {
    const nextMembers = group.members.filter((member) => {
      if (member.id !== memberId) return true;
      movingMember = member;
      return false;
    });
    group.members = nextMembers;
  });

  const targetGroup = state.groups.find((group) => group.id === targetGroupId);
  if (movingMember && targetGroup) {
    const insertIndex = Math.min(Math.max(targetIndex, 0), targetGroup.members.length);
    targetGroup.members.splice(insertIndex, 0, movingMember);
  }
}

function removeMember(memberId) {
  state.groups.forEach((group) => {
    group.members = group.members.filter((member) => member.id !== memberId);
  });
}

function renderSummary() {
  const counts = state.groups.map((group) => group.members.length);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const max = Math.max(0, ...counts);
  const min = Math.min(...counts);

  totalCount.textContent = `${total}명`;
  balanceText.textContent =
    total === 0
      ? "이름을 추가하면 자동으로 빈 조에 배정됩니다."
      : max - min <= 1
        ? "각 조 인원이 균형 있게 배정되어 있습니다."
        : "인원 차이가 큽니다. 섞어서 배정을 눌러 균형을 맞출 수 있어요.";
}

function persistAndRender() {
  saveState();
  render();
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return { groups: structuredClone(defaultGroups) };

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed.groups) || parsed.groups.length !== groupCount) {
      return { groups: structuredClone(defaultGroups) };
    }
    return parsed;
  } catch {
    return { groups: structuredClone(defaultGroups) };
  }
}

function shuffle(items) {
  const nextItems = [...items];
  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[randomIndex]] = [nextItems[randomIndex], nextItems[index]];
  }
  return nextItems;
}

if (sessionStorage.getItem(authKey) === "signed-in") {
  showApp();
} else {
  showLogin();
}
