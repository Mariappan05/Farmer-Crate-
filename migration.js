require('dotenv').config({ path: 'C:/Users/madan/FarmerCrate/FarmerCrate/.env' });
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

const query = async () => {
    try {
        await sequelize.authenticate();
        await sequelize.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_proof_image_url TEXT;');
        await sequelize.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_signature_url TEXT;');
        await sequelize.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_remarks TEXT;');
        console.log('Columns added successfully.');
    } catch (e) {
        console.error('Error adding columns:', e.message);
    } finally {
        await sequelize.close();
    }
};
query();
