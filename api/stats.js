const { loadDocs } = require("./knowledge");

module.exports = async function handler(req, res) {
  const docs = await loadDocs();
  const byCategory = docs.reduce((acc, doc) => {
    acc[doc.category] = (acc[doc.category] || 0) + 1;
    return acc;
  }, {});

  res.status(200).json({ total: docs.length, byCategory });
};
