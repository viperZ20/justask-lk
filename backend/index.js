
require('dns').setServers(['8.8.8.8', '1.1.1.1']);

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const mongoose = require('mongoose');
const { generalLimiter } = require('./middleware/rateLimit');

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
   
    require('./services/sessionTimeout').startSessionSweeper();
  })
  .catch(err => console.error('Mongo error:', err.message));

const app = express();
app.set('trust proxy', 1);
app.use(cors());


app.use(express.json({ limit: '2mb' }));


app.use(require('./middleware/accessGate').accessGate);
app.use('/api', generalLimiter);

app.use('/api/session', require('./routes/session'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/doctor', require('./routes/doctor'));
app.use('/api/doctor-auth', require('./routes/doctorAuth'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));