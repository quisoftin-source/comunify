const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        const db = mongoose.connection;
        const result = await db.collection('users').updateMany(
            {},
            { $set: { validation: 'approved', isAdmin: true } }
        );
        console.log('Successfully approved users:', result.modifiedCount);
        mongoose.connection.close();
    })
    .catch(console.error);
