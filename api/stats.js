const { loadDocs } = require("./knowledge");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const docs = await loadDocs();
    const byCategory = docs.reduce((acc, doc) => {
      acc[doc.category] = (acc[doc.category] || 0) + 1;
      return acc;
    }, {});

    res.status(200).json({
      total: docs.length,
      byCategory
    });
  } catch (error) {
    res.status(500).json({ error: "Stats unavailable", detail: error.message });
  }
};
