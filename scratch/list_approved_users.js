const mongoose = require('mongoose');
const { User } = require('../models/userModel');

async function run() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/comunify', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        const users = await User.find({ societyName: 'Prestige Kingfisher Towers' });
        console.log(JSON.stringify(users, null, 2));
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
