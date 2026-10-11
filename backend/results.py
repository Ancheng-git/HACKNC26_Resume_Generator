"""Bounded, deterministic task feedback; never calls a model or returns raw logs."""
import json
from pathlib import Path
import re


def read_result(directory, name):
    if directory is None:
        return ''
    root = Path(directory).resolve()
    path = root / name
    try:
        if path.is_symlink() or not path.resolve().is_relative_to(root) or path.stat().st_size > 128 * 1024:
            return ''
        return path.read_text(encoding='utf-8')
    except (OSError, UnicodeError):
        return ''


def plain(text, limit=400):
    text = str(text)[:2000]
    text = re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', '[contact omitted]', text)
    text = re.sub(r'https?://\S+|/(?:Users|home|private|tmp)/\S+', '[location omitted]', text)
    text = re.sub(r'[*`#]', '', text)
    return ' '.join(text.split())[:limit]


def failure_summary(task):
    category = task.get('failure_category', 'validation')
    report = read_result(task.get('directory'), 'report.md')
    try:
        completion = json.loads(read_result(task.get('directory'), 'completion.json') or '{}')
        if not isinstance(completion, dict):
            completion = {}
    except ValueError:
        completion = {}
    findings = []
    in_gaps = False
    for line in report.splitlines():
        if re.match(r'^#{1,6}\s', line):
            in_gaps = bool(re.search(r'gap|limitation|\u7f3a\u53e3|\u5dee\u8ddd', line, re.I))
            continue
        if line.strip() and (in_gaps or re.match(r'^\s*[-*]\s+\*\*(?:Role bucket|Domain fit)', line, re.I)):
            item = plain(line.lstrip('-* '))
            if item and item not in findings:
                findings.append(item)
    gaps = completion.get('gaps')
    if not findings and isinstance(gaps, str) and gaps.strip():
        findings.append(plain(gaps, 1000))

    summaries = {
        'ats': 'The documents were not published because the ATS publication requirements were not met. Review the recorded scores and genuine requirements gaps below.',
        'authentication': 'Generation could not use the local Claude Code login. This does not indicate a problem with the applicant\'s qualifications.',
        'timeout': 'Generation exceeded the configured time limit. This is a runtime failure, not an assessment of the applicant\'s qualifications.',
        'stopped': 'The local service stopped before generation finished. No verified documents were published.',
        'environment': 'A required local program or dependency could not run. Fix the environment before resubmitting; applicant skill gaps have not been established.',
        'workflow': 'The generation workflow did not finish successfully. Check the local execution or tool permissions before changing the applicant\'s materials.',
        'layout': 'The final documents did not pass the one-page or text completeness check. The layout needs correction before publication.',
        'format': 'The ATS document contains a forbidden format. A high keyword score cannot override this check.',
        'content': 'The two resume versions did not preserve the same selected content, or the content structure was invalid.',
        'validation': 'Required task artifacts or validation evidence were missing or invalid. The output cannot be treated as final.',
    }
    checks = {}
    score = task.get('validation_score', {})
    if isinstance(score, dict) and score:
        match = score.get('keyword_match', {})
        if not isinstance(match, dict):
            match = {}
        missing = match.get('must_have_missing', [])
        if not isinstance(missing, list):
            missing = []
        def percentage(value):
            return value if type(value) in (int, float) and 0 <= value <= 100 else None
        passes = completion.get('revision_passes')
        checks = {'composite_score': percentage(score.get('composite_score')),
                  'must_have_pct': percentage(match.get('must_have_pct')),
                  'missing_must_have': [plain(term, 120) for term in missing if isinstance(term, str)][:8],
                  'revision_passes': passes if type(passes) is int and 0 <= passes <= 3 else None}
    if category == 'ats':
        focus = [{'area': term, 'action': f'If you already use {term}, upload concrete project or work evidence. Otherwise, practice it in a relevant project before claiming it on your resume.'}
                 for term in checks.get('missing_must_have', [])[:5]]
        if re.search(r'\b\d+\+?\s*years\b|\u5e74.*\u7ecf\u9a8c', ' '.join(findings), re.I):
            focus.append({'area': 'Role seniority and commercial experience',
                          'action': 'The workflow report notes an experience gap. Prioritize roles matching your documented experience and build relevant experience through projects, internships or work; never inflate years.'})
        if not focus:
            focus.append({'area': 'Evidence for the job requirements',
                          'action': 'Compare the JD with your real experience and upload missing factual examples. A missing keyword alone does not prove that you lack the skill.'})
        focus.append({'area': 'Complete the required review process',
                      'action': 'Below-threshold publication requires three actual source-grounded review/recheck passes and a remaining-gap report. Do not invent skills or edit the pass count to bypass validation.'})
    else:
        actions = {
            'authentication': 'Check claude auth status under the same system user and complete the existing login, then submit a new task.',
            'timeout': 'Check the local task logs for the slow or blocked step. Adjust RESUME_TIMEOUT_SECONDS only if needed, then resubmit.',
            'stopped': 'Restart the backend, upload your materials again, and submit a new task when the service is ready.',
            'environment': 'Check the local Python, Node, LibreOffice and Claude Code installations and task logs before retrying.',
            'workflow': 'Review the task logs locally for execution or permission failures. Keep the existing authentication and tool restrictions.',
            'layout': 'Review page overflow or clipped text. Shorten lower-priority content without removing facts, rebuild and rerun page and visual checks.',
            'format': 'Use the existing ATS builder and correct the reported layout violations, then rerun validation.',
            'content': 'Rebuild both resumes from the same final content JSON and rerun the shared-content verification.',
            'validation': 'Check the local report and validation files. Complete missing document, visual review or content checks before retrying.',
        }
        focus = [{'area': 'Resolve the generation issue first', 'action': actions.get(category, actions['validation'])}]
    return {'category': category, 'summary': summaries.get(category, summaries['validation']),
            'report_available': bool(report.strip()), 'report_summary': findings[:6],
            'checks': checks, 'focus_areas': focus}
