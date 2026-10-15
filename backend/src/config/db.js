// MongoDB connection (Mongoose). No transactions are used anywhere, so a plain local
// MongoDB, Docker container or Atlas free cluster all work.
const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

async function connectDb() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dimlight';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  return mongoose.connection;
}

module.exports = { connectDb, mongoose };
