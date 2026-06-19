const mongoose = require('mongoose');

exports.connectDB = async() => {
    try {
        console.log("Connecting to MongoDB: " + process.env.MONGO_URI);
        const connection = await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000 // 5 seconds timeout
        });
        console.log("MongoDB connected: " + connection.connection.host);
    }
    catch (error) {
        console.warn("Could not connect to configured MongoDB: " + error.message);
        console.log("Starting in-memory fallback MongoDB server...");
        try {
            const { MongoMemoryServer } = require('mongodb-memory-server');
            const mongoServer = await MongoMemoryServer.create();
            const mongoUri = mongoServer.getUri();
            
            // Overwrite URI so multiTenant uses the same database connection pool
            process.env.MONGO_URI = mongoUri;
            
            const connection = await mongoose.connect(mongoUri);
            console.log("Fallback in-memory MongoDB connected: " + connection.connection.host);
        } catch (fallbackError) {
            console.error("Failed to start in-memory database: " + fallbackError.message);
            process.exit(1);
        }
    }
}