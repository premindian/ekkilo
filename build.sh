#!/bin/bash
# Build script for Render deployment

echo "🔨 Building Frontend..."
cd frontend
npm install
npm run build

echo "📦 Installing Backend Dependencies..."
cd ../backend
pip install -r requirements.txt

echo "✅ Build Complete!"
