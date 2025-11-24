FROM node:20

WORKDIR /app

# 의존성 설치
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN npm install

# 소스 복사
COPY . .

# 개발용: next dev
CMD ["npm", "run", "dev"]
