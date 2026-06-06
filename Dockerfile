# ==========================================
# Stage 1: Build the Vue application
# ==========================================
FROM node:20-alpine AS build-stage

WORKDIR /app

# Copy package files and install dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy the rest of the code and build
COPY . .
RUN yarn build


# ==========================================
# Stage 2: Serve with Nginx
# ==========================================
FROM nginx:alpine AS production-stage

# Copy the custom Nginx config for Vue Router (History Mode)
# (You'd need to create this nginx.conf file in your repo)
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built assets from the build stage
COPY --from=build-stage /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
