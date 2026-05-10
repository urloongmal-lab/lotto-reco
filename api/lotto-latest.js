const ENDPOINT = 'https://www.dhlottery.co.kr/selectMainInfo.do';

module.exports = async function handler(req, res) {
  try {
    const upstream = await fetch(ENDPOINT, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.dhlottery.co.kr/common.do?method=main',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `upstream http ${upstream.status}` });
      return;
    }

    const body = await upstream.json();
    const lt645 = body?.data?.result?.pstLtEpstInfo?.lt645 || [];
    if (!lt645.length) {
      res.status(502).json({ error: 'lt645 payload missing' });
      return;
    }

    const latest = [...lt645].sort((a, b) => Number(b.ltEpsd) - Number(a.ltEpsd))[0];
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({
      round: Number(latest.ltEpsd),
      date: String(latest.ltRflYmd).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'),
      numbers: [latest.tm1WnNo, latest.tm2WnNo, latest.tm3WnNo, latest.tm4WnNo, latest.tm5WnNo, latest.tm6WnNo].map(Number),
      bonus: Number(latest.bnsWnNo),
      source: 'dhlottery.selectMainInfo',
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'failed to load latest lotto data' });
  }
};
