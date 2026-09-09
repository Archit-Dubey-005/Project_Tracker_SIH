const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SiteBridge AI prototype running on http://localhost:${PORT}`));
