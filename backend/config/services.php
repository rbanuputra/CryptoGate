<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'coingecko' => [
        'base_url' => env('COINGECKO_BASE_URL', 'https://api.coingecko.com/api/v3'),
        'api_key' => env('COINGECKO_API_KEY', ''),
        'cache_ttl' => env('COINGECKO_CACHE_TTL', 900),
    ],

    'defillama' => [
        'base_url' => env('DEFILLAMA_BASE_URL', 'https://api.llama.fi'),
        'cache_ttl' => env('DEFILLAMA_CACHE_TTL', 3600),
    ],

    'etherscan' => [
        'base_url' => env('ETHERSCAN_BASE_URL', 'https://api.etherscan.io/v2/api'),
        'api_key' => env('ETHERSCAN_API_KEY', ''),
        'cache_ttl' => env('ETHERSCAN_CACHE_TTL', 3600),
    ],


];
