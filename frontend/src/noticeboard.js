// Real jobs are read through the local backend. No personal materials go to JSearch.
function mountNoticeboard(root) {
  const find = selector => root.querySelector(selector);
  const form = find('#noticeboard-filters');
  const category = find('#noticeboard-category');
  const query = find('#noticeboard-query');
  const location = find('#noticeboard-location'), remote = find('#noticeboard-remote');
  const searchButton = form.querySelector('button');
  const status = find('#noticeboard-status');
  const results = find('#noticeboard-results');
  const detail = find('#noticeboard-detail');
  const previous = find('#noticeboard-previous'), next = find('#noticeboard-next');
  let controller = null, closed = false, page = 1, filters = { query: '', location: '', remote: 'false' };

  const element = (tag, text) => { const node = document.createElement(tag); node.textContent = text; return node; };
  function sourceLink(job) {
    if (job.source === 'sample') return element('span', 'Sample — fictional posting, no application link');
    if (!job.applyUrl) return element('span', 'JSearch · No application link supplied');
    const link = element('a', 'View original posting ↗');
    const url = new URL(job.applyUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid provider link.');
    link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    return link;
  }
  async function request(path, message, render) {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    status.textContent = message;
    searchButton.disabled = true;
    previous.disabled = next.disabled = true;
    try {
      const data = await readResponse(await fetch(`${API_BASE}${path}`, { signal: current.signal }));
      if (closed || current.signal.aborted) return;
      render(data);
    } catch (error) {
      if (!closed && !current.signal.aborted) status.textContent = `${error.message} Check the backend and internet connection, then search again.`;
    } finally {
      if (!closed && controller === current) {
        controller = null;
        searchButton.disabled = false;
        previous.disabled = next.disabled = false;
      }
    }
  }
  function providerHint(data) {
    const messages = {
      timeout: 'JSearch timed out.', network_error: 'Could not reach JSearch.',
      http_401: 'JSearch rejected the API key. Check the backend key.',
      http_403: 'JSearch denied access. Check the API key and subscription.',
      http_429: 'JSearch quota or rate limit reached. Check RapidAPI usage.',
      invalid_response: 'JSearch returned an unsupported response.',
    };
    const message = messages[data.provider_error] || (data.provider_error ? 'JSearch temporarily failed.' : '');
    const wait = data.retry_after > 0 ? ` Search again in ${Math.ceil(data.retry_after / 60)} minute(s); cached searches still work.` : '';
    return `${message ? ` ${message}` : ''}${wait}`;
  }
  function cacheNote(data) {
    return data.degraded ? ` Showing sample jobs, not matching live vacancies (${data.reason || 'sample'}).${providerHint(data)}` : data.cached ? ' From the 24-hour cache.' : '';
  }
  function showDetail(data) {
    const job = data.job;
    detail.replaceChildren(); detail.hidden = false;
    detail.append(element('h3', job.title), element('p', `${job.company} · ${job.location || 'See location restrictions in the JD'}`), sourceLink(job));
    const description = element('p', job.description);
    description.className = 'noticeboard-description';
    detail.append(description);
    const importButton = element('button', 'Use job at workbench'); importButton.type = 'button';
    const generateButton = element('button', 'Generate this application'); generateButton.type = 'button';
    const valid = !!job.company?.trim() && !!job.title?.trim() && !!job.description?.trim()
      && job.company.length <= 120 && job.title.length <= 120
      && `${job.title}\nCompany: ${job.company}\n\n${job.description}`.length <= 50000;
    const busy = applications.some(application => ['submitting', 'queued', 'running'].includes(application.status));
    importButton.disabled = !valid;
    generateButton.disabled = !valid || !state.backgroundId || busy;
    importButton.addEventListener('click', () => { if (valid) importJobApplication(job); });
    generateButton.addEventListener('click', () => { if (valid && state.backgroundId && !applications.some(application => ['submitting', 'queued', 'running'].includes(application.status))) importJobApplication(job, true); });
    detail.append(importButton, generateButton);
    const note = !valid ? 'This listing exceeds the generation input limits or lacks required details. Use the source link; its description has not been silently shortened.'
      : !state.backgroundId ? 'You can save this job as a draft. Upload your resume and photo in the materials chest before generating.'
      : busy ? 'Another application is generating. You can prepare this job as a draft and generate it later.'
      : 'Selecting a job does not generate anything. Generate uses your uploaded materials and the existing backend workflow.';
    detail.append(element('p', note));
    status.textContent = `Job details loaded.${cacheNote(data)}`;
    detail.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
  }
  function clearResults() {
    results.replaceChildren(); detail.replaceChildren(); detail.hidden = true;
    previous.hidden = next.hidden = true;
  }
  function filtersChanged() {
    if (!filters.query) return;
    controller?.abort(); controller = null;
    clearResults();
    searchButton.disabled = false;
    status.textContent = 'Filters changed. Search again to see matching jobs.';
  }
  form.addEventListener('input', filtersChanged);
  form.addEventListener('change', filtersChanged);
  function search(targetPage) {
    page = targetPage;
    clearResults();
    const params = new URLSearchParams({ ...filters, page: String(page) });
    return request(`/api/jobs?${params}`, 'Loading real jobs…', data => {
      status.textContent = data.degraded && !data.jobs.length
        ? `Live search unavailable (${data.reason}).${providerHint(data)} No matching sample postings for these filters.`
        : `${data.jobs.length} job(s) on page ${data.page}.${cacheNote(data)}${data.jobs.length ? '' : ' Try another category or keyword.'}`;
      data.jobs.forEach(job => {
        const card = document.createElement('article');
        const button = element('button', job.title); button.type = 'button';
        button.addEventListener('click', () => {
          detail.replaceChildren(); detail.hidden = true;
          request(`/api/jobs/${encodeURIComponent(job.id)}`, 'Loading full job description…', showDetail);
        });
        card.append(button, element('p', `${job.company} · ${job.location || 'See JD'} · ${job.remote ? 'Remote' : 'See work arrangement in JD'}`));
        if (job.employmentType) card.append(element('p', job.employmentType));
        if (job.snippet) card.append(element('p', job.snippet));
        card.append(sourceLink(job)); results.append(card);
      });
      previous.hidden = data.page <= 1;
      next.hidden = !data.has_more;
    });
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const term = [category.value, query.value.trim()].filter(Boolean).join(' ').trim();
    if (!term || term.length > 300) { filtersChanged(); clearResults(); status.textContent = 'Choose a category or enter keywords (combined maximum 300 characters).'; return; }
    filters = { query: term, location: location.value.trim(), remote: String(remote.value === 'true') };
    search(1);
  });
  previous.addEventListener('click', () => search(page - 1));
  next.addEventListener('click', () => search(page + 1));
  request('/api/jobs/categories', 'Loading job categories…', data => {
    data.categories.forEach(item => { const option = element('option', item.name); option.value = item.id; category.append(option); });
    category.disabled = false;
    status.textContent = `Choose a category or keyword, then search.${cacheNote(data)}`;
  });
  return () => { closed = true; controller?.abort(); };
}
