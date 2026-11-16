require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger');

const authRoutes = require('./routes/authRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const screeningRoutes = require('./routes/screeningRoutes');
const queueRoutes = require('./routes/queueRoutes');
const path = require('node:path');

const app = express();
app.use(cors());
app.use(express.json());
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/welcome.html')));
app.use(express.static(path.join(__dirname, '../public')));

// ทดสอบ API (Swagger UI)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));


// เชื่อม Core Endpoints
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/services', serviceRoutes);
app.use('/api/v1/screenings', screeningRoutes);
app.use('/api/v1/queue', queueRoutes);

const PORT = process.env.PORT || 5000;
if (require.main === module) app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Swagger UI ready at http://localhost:${PORT}/api-docs`);
});
module.exports = app;
