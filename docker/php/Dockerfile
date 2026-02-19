FROM php:8.2-fpm

RUN apt-get update && apt-get install -y \
    libpq-dev \
    libzip-dev \
    unzip \
    git \
    curl \
  && docker-php-ext-install pdo pdo_pgsql \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www
