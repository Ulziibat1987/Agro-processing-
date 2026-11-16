const googleForm = new URL('https://docs.google.com/forms/d/e/1FAIpQLSdMtkn-iv4b8sXFnXh4Kd2-ZvRKtAcKqIuEiO5j0ihbfYF4OQ/');
const formPage = new URL('viewform?hl=en', googleForm);
const formAction = new URL('formResponse?hl=en', googleForm);
const googleLanguage = { 'Accept-Language': 'en-US,en;q=0.9' };
const hiddenFields = ['fvv', 'pageHistory', 'fbzx', 'partialResponse'];
const formFields = {
  product: ['1485111193', 220],
  category: ['586404840', 120],
  name: ['118692603', 160],
  phone: ['527146533', 32],
  email: ['1269722023', 254],
  note: ['183427994', 400],
  capacity: ['787123923', 1000],
  requirements: ['1726224160', 1000],
};

async function recordOrder(request, url) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false }, { status: 405, headers: { Allow: 'POST' } });
  }
  if (request.headers.get('Origin') !== url.origin) {
    return Response.json({ ok: false }, { status: 403 });
  }
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') ?? '')) {
    return Response.json({ ok: false }, { status: 415 });
  }
  let order;
  try {
    const body = await request.text();
    if (body.length > 4000) return Response.json({ ok: false }, { status: 413 });
    order = JSON.parse(body);
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const fields = new URLSearchParams();
  for (const [key, [id, limit]] of Object.entries(formFields)) {
    const input = typeof order?.[key] === 'string' ? order[key].trim() : '';
    if (!input || input.length > limit) return Response.json({ ok: false }, { status: 400 });
    fields.set('entry.' + id, input);
  }
  try {
    const signal = AbortSignal.timeout(12000);
    const page = await fetch(formPage, {
      headers: googleLanguage,
      redirect: 'error',
      signal,
    });
    if (!page.ok) {
      console.warn('Order form could not be loaded.', page.status);
      return Response.json({ ok: false }, { status: 502 });
    }
    const markup = await page.text();
    for (const field of hiddenFields) {
      const value = markup.match(new RegExp('name="' + field + '" value="([^"]*)"'))?.[1];
      if (value === undefined) {
        console.warn('Google returned an unexpected order form.');
        return Response.json({ ok: false }, { status: 502 });
      }
      fields.set(field, value.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&'));
    }
    const headers = { ...googleLanguage, Referer: formPage.href, Origin: googleForm.origin };
    const cookies = page.headers.getSetCookie().map(cookie => cookie.split(';', 1)[0]).join('; ');
    if (cookies) headers.Cookie = cookies;
    const result = await fetch(formAction, {
      method: 'POST',
      body: fields,
      headers,
      redirect: 'manual',
      signal,
    });
    // Google can return a form validation page with HTTP 200.
    if (result.ok && /<div\b[^>]*>\s*Your response has been recorded\.\s*<\/div>/i.test(await result.text())) {
      return Response.json({ ok: true });
    }
    console.warn('Google did not confirm receipt of the order.', result.status);
  } catch (error) {
    console.warn('Contact with the order form failed.', error.name);
  }
  return Response.json({ ok: false }, { status: 502 });
}

export default {
  fetch(request) {
    return recordOrder(request, new URL(request.url));
  },
};
