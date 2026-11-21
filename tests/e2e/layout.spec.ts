import { ARTIST_LINKS, HEADING, INPUT, ROWS, openApp, overflowsHorizontally } from './support/app';
import { artistFact, countText } from './support/data';
import { expect, test } from './support/test';

// The layout spec table of docs/SHARED_COMPONENTS.md as computed-style and box assertions (the QA measurements, ported).
// Runs in the `mobile` project (390x844) and in `desktop` (1280x800, where the page is a centred 560px column).
// Smoke steps ported: 7 (row and empty-state metrics), 9 (200-letter echo at 320), 12 (artist rows, labels), 13 (heading block), 18 (no horizontal scroll).

test.describe('layout spec table', () => {
  test('header 56px with a 1px divider; wordmark 20/24 (SongHub 800, Songbook 400); toggle 44x44 with a 24px icon', async ({ page }) => {
    await openApp(page);
    const m = await page.evaluate(() => {
      const r = (el: Element) => el.getBoundingClientRect();
      const cs = (el: Element) => getComputedStyle(el);
      const header = document.querySelector('header') as HTMLElement;
      const h1 = header.querySelector('h1') as HTMLElement;
      const [name, rest] = [...h1.children] as HTMLElement[];
      const toggle = header.querySelector('button') as HTMLButtonElement;
      const icon = toggle.querySelector('svg') as SVGElement;
      const note = header.querySelector('svg') as SVGElement;
      return {
        height: r(header).height,
        border: [cs(header).borderBottomWidth, cs(header).borderBottomColor],
        bg: [cs(header).backgroundColor, cs(document.body).backgroundColor],
        h1Font: [cs(h1).fontSize, cs(h1).lineHeight],
        name: [cs(name as Element).fontWeight, cs(name as Element).color],
        rest: [cs(rest as Element).fontWeight, cs(rest as Element).color],
        toggle: [r(toggle).width, r(toggle).height, r(toggle).right, r(header).right - 16],
        icon: [r(icon).width, r(icon).height],
        note: [r(note).width, r(note).height, cs(note).color],
        h1Count: document.querySelectorAll('h1').length,
        toggleColor: cs(toggle).color,
      };
    });
    expect(m.height).toBe(56);
    expect(m.border).toEqual(['1px', 'rgb(42, 46, 59)']);
    expect(m.bg[0]).toBe(m.bg[1]);
    expect(m.h1Font).toEqual(['20px', '24px']);
    expect(m.name).toEqual(['800', 'rgb(244, 245, 248)']);
    expect(m.rest).toEqual(['400', 'rgb(169, 174, 189)']);
    expect(m.toggle.slice(0, 2)).toEqual([44, 44]);
    expect(m.toggle[2], 'toggle sits at the right page margin (16px)').toBe(m.toggle[3]);
    expect(m.icon).toEqual([24, 24]);
    expect(m.note).toEqual([24, 24, 'rgb(255, 201, 51)']);
    expect(m.toggleColor).toBe('rgb(169, 174, 189)');
    expect(m.h1Count).toBe(1);
  });

  test('search strip 72px and sticky; field 56px with radius 16, 1px idle border, 18/24 text 52px in, 24px magnifier 16px in', async ({ page }) => {
    await openApp(page);
    await page.locator(INPUT).blur(); // the box is autofocused: measure the idle border
    const m = await page.evaluate(() => {
      const r = (el: Element) => el.getBoundingClientRect();
      const cs = (el: Element) => getComputedStyle(el);
      const input = document.querySelector('#search-input') as HTMLInputElement;
      const strip = document.querySelector('[role="search"]') as HTMLElement;
      const field = input.parentElement as HTMLElement;
      const overlay = field.querySelector('[aria-hidden="true"].pointer-events-none:not(svg)') as HTMLElement;
      const magnifier = field.querySelector('svg') as SVGElement;
      return {
        strip: [r(strip).height, cs(strip).position, cs(strip).top, cs(strip).backgroundColor, cs(strip).paddingTop, cs(strip).paddingBottom, cs(strip).paddingLeft, cs(strip).paddingRight],
        field: [r(field).height, r(field).left, r(field).right, cs(field).borderRadius, cs(field).backgroundColor],
        inset: [r(field).left - r(strip).left, r(strip).right - r(field).right],
        inputFont: [cs(input).fontSize, cs(input).lineHeight, cs(input).fontWeight],
        paddingLeft: cs(input).paddingLeft,
        radius: cs(input).borderRadius,
        border: overlay ? [cs(overlay).borderTopWidth, cs(overlay).borderTopColor, cs(overlay).borderRadius] : null,
        magnifier: [r(magnifier).width, r(magnifier).height, r(magnifier).left - r(field).left, cs(magnifier).color],
        placeholder: input.placeholder,
        attrs: [input.type, input.inputMode, input.enterKeyHint, input.autocapitalize, input.getAttribute('autocorrect'), input.autofocus],
        fontSizeAtLeast16: parseFloat(cs(input).fontSize) >= 16,
      };
    });
    expect(m.strip).toEqual([72, 'sticky', '0px', 'rgb(14, 15, 20)', '8px', '8px', '16px', '16px']);
    expect(m.field.slice(0, 1)).toEqual([56]);
    expect(m.field[3]).toBe('16px');
    expect(m.field[4]).toBe('rgb(32, 35, 46)');
    expect(m.inputFont).toEqual(['18px', '24px', '400']);
    expect(m.fontSizeAtLeast16, 'no iOS zoom on focus').toBe(true);
    expect(m.paddingLeft).toBe('52px');
    expect(m.radius).toBe('16px');
    expect(m.border).toEqual(['1px', 'rgb(107, 112, 131)', '16px']);
    expect(m.magnifier).toEqual([24, 24, 16, 'rgb(138, 144, 163)']);
    expect(m.placeholder).toBe('Search song or artist');
    expect(m.attrs).toEqual(['search', 'search', 'search', 'none', 'off', true]);
    // focused: the border becomes 2px accent (the text does not move, the border is an overlay)
    await page.locator(INPUT).focus();
    const focused = await page.evaluate(() => {
      const overlay = (document.querySelector('#search-input') as HTMLElement).parentElement?.querySelector('div.pointer-events-none') as HTMLElement;
      return [getComputedStyle(overlay).borderTopWidth, getComputedStyle(overlay).borderTopColor];
    });
    expect(focused).toEqual(['2px', 'rgb(255, 201, 51)']);
    expect(m.inset, 'the field has 16px page margins each side').toEqual([16, 16]);
  });

  test('the strip stays pinned at the top of the screen while the results scroll', async ({ page }) => {
    await openApp(page, '/?q=love');
    await page.locator(ROWS).nth(49).waitFor();
    await page.evaluate(() => window.scrollTo(0, 800));
    expect(await page.evaluate(() => Math.round((document.querySelector('[role="search"]') as HTMLElement).getBoundingClientRect().top))).toBe(0);
    // the header scrolls away
    expect(await page.evaluate(() => (document.querySelector('header') as HTMLElement).getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
  });

  test('home state: 48px accent note, 20/28 700 title, 16/24 line, 14/20 muted line, 64px below the field', async ({ page }) => {
    await openApp(page);
    const m = await page.evaluate(() => {
      const r = (el: Element) => el.getBoundingClientRect();
      const cs = (el: Element) => getComputedStyle(el);
      const title = document.querySelector('#home-title') as HTMLElement;
      const section = title.parentElement as HTMLElement;
      const icon = section.querySelector('svg') as SVGElement;
      const [, , line, muted] = [...section.children] as HTMLElement[];
      const field = (document.querySelector('#search-input') as HTMLElement).parentElement as HTMLElement;
      return {
        below: r(icon).top - r(field).bottom,
        icon: [r(icon).width, r(icon).height, cs(icon).color],
        title: [cs(title).fontSize, cs(title).lineHeight, cs(title).fontWeight, cs(title).color, title.textContent],
        line: [cs(line as Element).fontSize, cs(line as Element).lineHeight, cs(line as Element).color, line?.textContent],
        muted: [cs(muted as Element).fontSize, cs(muted as Element).lineHeight, cs(muted as Element).color, muted?.textContent],
        align: cs(section).textAlign,
      };
    });
    expect(m.below).toBe(64);
    expect(m.icon).toEqual([48, 48, 'rgb(255, 201, 51)']);
    expect(m.title).toEqual(['20px', '28px', '700', 'rgb(244, 245, 248)', 'Find your song number']);
    expect(m.line).toEqual(['16px', '24px', 'rgb(169, 174, 189)', 'Type a song title or an artist.']);
    expect(m.muted).toEqual(['14px', '20px', 'rgb(138, 144, 163)', 'About 47,000 songs']);
    expect(m.align).toBe('center');
  });

  test('song rows: 88px, number column 136px (36/40 800 tabular, accent), title 17/22 600, artist 14/20 400, 2px gap, 16px padding, 1px divider', async ({ page }) => {
    await openApp(page, '/?q=love');
    await page.locator(ROWS).nth(49).waitFor();
    const m = await page.evaluate((ROWS) => {
      const li = document.querySelector(ROWS) as HTMLElement;
      const [, num, text] = [...li.children] as HTMLElement[];
      const [title, artist] = [...(text as HTMLElement).children] as HTMLElement[];
      const r = (el: Element) => el.getBoundingClientRect();
      const cs = (el: Element) => getComputedStyle(el);
      return {
        heights: [...document.querySelectorAll(ROWS)].map((row) => r(row).height),
        minHeight: cs(li).minHeight,
        padding: [cs(li).paddingLeft, cs(li).paddingRight],
        divider: [cs(li).borderBottomWidth, cs(li).borderBottomColor],
        gapRow: cs(li).columnGap,
        numberWidth: r(num as Element).width,
        numberMinWidth: cs(num as Element).minWidth,
        numberFont: [cs(num as Element).fontSize, cs(num as Element).lineHeight, cs(num as Element).fontWeight, cs(num as Element).letterSpacing, cs(num as Element).textAlign],
        numberColor: cs(num as Element).color,
        numberTabular: cs(num as Element).fontVariantNumeric,
        titleFont: [cs(title as Element).fontSize, cs(title as Element).lineHeight, cs(title as Element).fontWeight, cs(title as Element).color],
        titleClamp: cs(title as Element).webkitLineClamp,
        artistFont: [cs(artist as Element).fontSize, cs(artist as Element).lineHeight, cs(artist as Element).fontWeight, cs(artist as Element).color],
        gap: r(artist as Element).top - r(title as Element).bottom,
        textLeft: r(text as Element).left - r(li).left,
        listWidth: r(li).width,
        pageWidth: document.documentElement.clientWidth,
      };
    }, ROWS);
    expect(m.heights.every((h) => h === 88), `every row is exactly 88px (got ${[...new Set(m.heights)]})`).toBe(true);
    expect(m.minHeight).toBe('88px');
    expect(m.padding).toEqual(['16px', '16px']);
    expect(m.divider).toEqual(['1px', 'rgb(42, 46, 59)']);
    expect(m.gapRow).toBe('12px');
    expect(m.numberWidth, 'the number column is exactly 136px at normal size').toBe(136);
    expect(m.numberMinWidth).toBe('136px');
    expect(m.numberFont).toEqual(['36px', '40px', '800', '-0.36px', 'left']);
    expect(m.numberColor).toBe('rgb(255, 201, 51)');
    expect(m.numberTabular).toContain('tabular-nums');
    expect(m.titleFont).toEqual(['17px', '22px', '600', 'rgb(244, 245, 248)']);
    expect(m.artistFont).toEqual(['14px', '20px', '400', 'rgb(169, 174, 189)']);
    expect(m.gap).toBe(2);
    expect(m.textLeft, 'text starts 16 + 136 + 12 px in').toBe(164);
    expect(m.listWidth, 'rows are full-bleed within the column').toBe(Math.min(m.pageWidth, 560));
  });

  test('hint row is 64px high, 14/20 muted, centred', async ({ page }) => {
    await openApp(page, '/?q=love');
    const hint = page.getByText('Showing the top 50 matches. Keep typing to narrow down.');
    await hint.waitFor();
    const m = await hint.evaluate((el) => {
      const cs = getComputedStyle(el);
      return [el.getBoundingClientRect().height, cs.fontSize, cs.lineHeight, cs.color, cs.textAlign];
    });
    expect(m).toEqual([64, '14px', '20px', 'rgb(138, 144, 163)', 'center']);
  });

  test('artist rows 64px with 1px dividers and 16px padding; name 17/22 600; count 14/20; chevron 20px 8px from the count; labels 32px 12/16 caps', async ({ page }) => {
    await openApp(page);
    await page.keyboard.type('eagl', { delay: 40 });
    await page.locator(ARTIST_LINKS).first().waitFor();
    await page.locator(ROWS).first().waitFor();
    const m = await page.evaluate((ARTIST_LINKS) => {
      const r = (el: Element) => el.getBoundingClientRect();
      const cs = (el: Element) => getComputedStyle(el);
      const links = [...document.querySelectorAll(ARTIST_LINKS)] as HTMLElement[];
      const labels = [...document.querySelectorAll('main h2')].filter((h) => ['Artists', 'Songs'].includes(h.textContent ?? '')) as HTMLElement[];
      const first = links[0] as HTMLElement;
      const [, name, count, chevron] = [...first.children] as HTMLElement[];
      const label = labels[0] as HTMLElement;
      return {
        heights: links.map((a) => r(a).height),
        labelHeights: labels.map((l) => r(l).height),
        labelText: labels.map((l) => l.textContent),
        labelFont: [cs(label).fontSize, cs(label).lineHeight, cs(label).fontWeight, cs(label).letterSpacing, cs(label).textTransform, cs(label).paddingLeft, cs(label).color],
        nameFont: [cs(name as Element).fontSize, cs(name as Element).lineHeight, cs(name as Element).fontWeight, cs(name as Element).color],
        countFont: [cs(count as Element).fontSize, cs(count as Element).lineHeight, cs(count as Element).fontWeight, cs(count as Element).color],
        chevron: [r(chevron as Element).width, r(chevron as Element).height],
        gapCountChevron: r(chevron as Element).left - r(count as Element).right,
        divider: cs(first.parentElement as Element).borderBottomWidth,
        side: [r(name as Element).left - r(first).left, r(first).right - r(chevron as Element).right],
        lastLinkBottom: r(links.at(-1) as Element).bottom,
        songsLabelTop: r(labels[1] as Element).top,
        firstRowTop: r(document.querySelector('main ul[aria-label="Song results"] > li') as Element).top,
      };
    }, ARTIST_LINKS);
    expect(m.heights.length).toBeGreaterThanOrEqual(1);
    expect(m.heights.every((h) => h === 64), `artist rows are 64px (${m.heights})`).toBe(true);
    expect(m.labelText).toEqual(['Artists', 'Songs']);
    expect(m.labelHeights).toEqual([32, 32]);
    expect(m.labelFont).toEqual(['12px', '16px', '600', '0.96px', 'uppercase', '16px', 'rgb(138, 144, 163)']);
    expect(m.nameFont).toEqual(['17px', '22px', '600', 'rgb(244, 245, 248)']);
    expect(m.countFont).toEqual(['14px', '20px', '400', 'rgb(169, 174, 189)']);
    expect(m.chevron).toEqual([20, 20]);
    expect(m.gapCountChevron).toBe(8);
    expect(m.divider).toBe('1px');
    expect(m.side).toEqual([16, 16]);
    expect(m.lastLinkBottom <= m.songsLabelTop + 1 && m.songsLabelTop < m.firstRowTop, 'ARTISTS rows, then the SONGS label, then the songs').toBe(true);
    expect(await overflowsHorizontally(page)).toBe(false);
  });

  test('artist heading: block min 80px with a 1px divider on the page background; back 44x44 with a 24px chevron; name 24/30 700; count 14/20; 8px between', async ({ page }) => {
    await openApp(page);
    await page.keyboard.type('eagl', { delay: 40 });
    await page.locator(ARTIST_LINKS).first().waitFor();
    const expected = artistFact('eagles');
    await page.locator(ARTIST_LINKS).first().click();
    await page.locator(HEADING).waitFor();
    const m = await page.evaluate(({ HEADING }) => {
      const r = (el: Element) => el.getBoundingClientRect();
      const cs = (el: Element) => getComputedStyle(el);
      const block = document.querySelector(HEADING) as HTMLElement;
      const back = block.querySelector('button') as HTMLButtonElement;
      const name = block.querySelector('h2') as HTMLElement;
      const count = block.querySelector('p') as HTMLElement;
      const icon = back.querySelector('svg') as SVGElement;
      return {
        block: [r(block).height, cs(block).minHeight, cs(block).borderBottomWidth, cs(block).borderBottomColor, cs(block).backgroundColor],
        back: [r(back).width, r(back).height, back.getAttribute('aria-label'), cs(back).color, r(icon).width],
        name: [name.textContent, cs(name).fontSize, cs(name).lineHeight, cs(name).fontWeight, cs(name).color, r(name).left - r(back).right],
        count: [count.textContent, cs(count).fontSize, cs(count).lineHeight, cs(count).color],
        pageBg: cs(document.body).backgroundColor,
      };
    }, { HEADING });
    expect(m.block[0]).toBe(80);
    expect(m.block[1]).toBe('80px');
    expect(m.block[2]).toBe('1px');
    expect(m.block[3]).toBe('rgb(42, 46, 59)');
    expect(m.block[4], 'heading block uses the page background').toBe(m.pageBg);
    expect(m.back.slice(0, 3)).toEqual([44, 44, 'Back to results']);
    expect(m.back[4], '24px chevron').toBe(24);
    expect(m.back[3], 'chevron is the primary text colour').toBe('rgb(244, 245, 248)');
    expect(m.name[0]).toBe(expected.name);
    expect(m.name.slice(1, 5)).toEqual(['24px', '30px', '700', 'rgb(244, 245, 248)']);
    expect(m.name[5], '8px between the chevron button and the name').toBe(8);
    expect(m.count).toEqual([countText(expected.count), '14px', '20px', 'rgb(169, 174, 189)']);
  });

  test('empty state: 64px below the field; 48px muted magnifier; 20/28 700 title; 16/24 echo; 14/20 hint', async ({ page }) => {
    await openApp(page);
    await page.locator(INPUT).fill('xyzqq');
    await page.getByRole('heading', { name: 'No songs found' }).waitFor();
    const m = await page.evaluate(() => {
      const r = (el: Element) => el.getBoundingClientRect();
      const cs = (el: Element) => getComputedStyle(el);
      const title = document.querySelector('#no-results-title') as HTMLElement;
      const section = title.parentElement as HTMLElement;
      const icon = section.querySelector('svg') as SVGElement;
      const field = (document.querySelector('#search-input') as HTMLElement).parentElement as HTMLElement;
      const echo = title.nextElementSibling as HTMLElement;
      const hint = echo.nextElementSibling as HTMLElement;
      return {
        below: r(icon).top - r(field).bottom,
        icon: [r(icon).width, r(icon).height, cs(icon).color],
        title: [cs(title).fontSize, cs(title).lineHeight, cs(title).fontWeight],
        titleGap: r(echo).top - r(title).bottom,
        echo: [cs(echo).fontSize, cs(echo).lineHeight, cs(echo).color, echo.textContent],
        hint: [cs(hint).fontSize, cs(hint).lineHeight, cs(hint).color, hint.textContent],
        buttons: document.querySelectorAll('main button').length,
      };
    });
    expect(m.below, 'the empty state starts 64px below the search field').toBe(64);
    expect(m.icon).toEqual([48, 48, 'rgb(138, 144, 163)']);
    expect(m.title).toEqual(['20px', '28px', '700']);
    expect(m.titleGap).toBe(16);
    expect(m.echo).toEqual(['16px', '24px', 'rgb(169, 174, 189)', 'Nothing matches "xyzqq".']);
    expect(m.hint).toEqual(['14px', '20px', 'rgb(138, 144, 163)', 'Check the spelling, or try fewer words.']);
    // "No buttons" besides the box's own clear button
    expect(m.buttons).toBe(1);
  });
});
