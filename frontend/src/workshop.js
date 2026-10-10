// Move the existing forms into one native dialog; their state and listeners stay intact.
const workshopDialog = document.querySelector('#workshop-dialog');
const workshopBody = document.querySelector('#workshop-panel-body');
let workshopPanel = null, workshopReturnFocus = null, workshopRestore = null;
const workshopTitles = { chest: 'Materials chest · Your materials', table: 'Workbench · Applications', board: 'Noticeboard · Green careers', furnace: 'Furnace · Generation tasks', anvil: 'Anvil · Model settings' };

function closeWorkshop() {
  if (!workshopPanel) return;
  if (workshopPanel === 'chest') setChestOpen(false);
  if (workshopRestore) {
    const { element, parent, sibling } = workshopRestore;
    parent.insertBefore(element, sibling);
    element.hidden = true;
    workshopRestore = null;
  }
  workshopPanel = null;
  workshopBody.replaceChildren();
  if (workshopDialog.open) workshopDialog.close();
  document.dispatchEvent(new CustomEvent('workshop-panel', { detail: { open: false } }));
  if (workshopReturnFocus?.isConnected && !document.querySelector('#eco-scene').hidden) workshopReturnFocus.focus({ preventScroll: true });
}
function openWorkshop(kind, trigger) {
  if (!Object.hasOwn(workshopTitles, kind)) return;
  closeWorkshop();
  workshopReturnFocus = trigger || document.querySelector(`[data-workshop="${kind}"]`);
  workshopPanel = kind;
  document.querySelector('#workshop-panel-title').textContent = workshopTitles[kind];
  if (kind === 'chest' || kind === 'table') {
    const element = document.querySelector(kind === 'chest' ? '#inventory' : '#workspace');
    workshopRestore = { element, parent: element.parentNode, sibling: element.nextSibling };
    workshopBody.append(element);
    element.hidden = false;
    if (kind === 'table') ensureApplication();
  } else if (kind === 'board' || kind === 'anvil') {
    workshopBody.append(document.querySelector(`#${kind}-content`).content.cloneNode(true));
  } else {
    const list = document.createElement('div');
    list.id = 'furnace-tasks'; list.className = 'workshop-info'; list.setAttribute('aria-live', 'polite');
    workshopBody.append(list);
    renderFurnace(furnaceState());
  }
  workshopDialog.classList.toggle('wide', kind === 'table');
  workshopDialog.showModal();
  document.dispatchEvent(new CustomEvent('workshop-panel', { detail: { open: true, kind } }));
  if (kind === 'chest') setChestOpen(true);
  else if (kind === 'table') document.querySelector('#job-title').focus();
  else document.querySelector('#workshop-close').focus();
}
function renderFurnace(summary) {
  document.querySelector('#furnace-label').textContent = summary.text;
  document.querySelector('#workshop-live-task').textContent = summary.tasks.length ? `Furnace: ${summary.text}` : '';
  const list = document.querySelector('#furnace-tasks');
  if (!list) return;
  list.replaceChildren();
  const note = document.createElement('p');
  note.textContent = 'Statuses come from submitted tasks and backend queries. Closing this panel or switching projects does not interrupt tasks. No progress percentage is estimated.';
  list.append(note);
  if (!summary.tasks.length) {
    const empty = document.createElement('p'); empty.textContent = 'No generation tasks yet. Upload your materials in the chest, then prepare an application at the workbench.'; list.append(empty);
  }
  summary.tasks.forEach(application => {
    const row = document.createElement('article');
    const label = document.createElement('h3'); label.textContent = application.label;
    const status = document.createElement('p'); status.textContent = taskText(application);
    row.append(label, status);
    if (application.error) { const error = document.createElement('p'); error.textContent = application.error; row.append(error); }
    list.append(row);
  });
}
window.workshop = {
  get active() { return workshopPanel; }, open: openWorkshop, close: closeWorkshop,
  uploaded(pack) {
    const warnings = document.querySelector('#upload-warnings').textContent;
    document.querySelector('#workshop-notice').textContent = `Materials uploaded successfully.${warnings ? ` Note: ${warnings}` : ''}`;
    closeWorkshop();
  },
};
document.querySelectorAll('[data-workshop]').forEach(button => button.addEventListener('click', () => (window.workshop.request || openWorkshop)(button.dataset.workshop, button)));
document.querySelector('#workshop-close').addEventListener('click', closeWorkshop);
workshopDialog.addEventListener('cancel', event => { event.preventDefault(); closeWorkshop(); });
document.addEventListener('workshop-tasks', event => renderFurnace(event.detail));
renderFurnace(furnaceState());
