<?php

namespace Database\Seeders;

use App\Models\SectorMapping;
use Illuminate\Database\Seeder;

class SectorMappingSeeder extends Seeder
{
    public function run(): void
    {
        $sectors = [
            'RWA (Real World Assets)' => [
                'Real World Assets (RWA)', 'RWA Protocol', 'Tokenized Assets',
                'Tokenized Private Credit', 'Tokenized Treasuries', 'Tokenized Commodities',
                'Tokenized Gold', 'Tokenized Stocks', 'Tokenized Money Market Fund', 'Tokenized Credit',
            ],
            'AI & Compute' => [
                'Artificial Intelligence (AI)', 'AI Agents', 'AI Applications', 'AI Framework',
            ],
            'DePIN' => [
                'DePIN',
            ],
            'L1 Infrastructure' => [
                'Smart Contract Platform', 'Layer 1 (L1)', 'Proof of Work (PoW)', 'Proof of Stake (PoS)',
            ],
            'L2 & Scaling' => [
                'Layer 2 (L2)', 'Rollup', 'SideChain', 'Layer 0 (L0)',
                'Optimism Superchain Ecosystem', 'Data Availability', 'Bitcoin Sidechains',
            ],
            'DeFi Core' => [
                'Decentralized Finance (DeFi)', 'Decentralized Exchange (DEX)',
                'Automated Market Maker (AMM)', 'Lending/Borrowing Protocols',
                'Yield Farming', 'Yield-Bearing Tokens', 'Perpetuals', 'Derivatives', 'Options',
            ],
            'Stablecoins & Yield' => [
                'Stablecoins', 'USD Stablecoin', 'Fiat-backed Stablecoin',
                'Crypto-backed Stablecoin', 'Algorithmic Stablecoin',
                'Yield-Bearing Stablecoin', 'Stablecoin Issuer', 'Synthetic Dollar',
            ],
            'Gaming & Metaverse' => [
                'Gaming (GameFi)', 'Metaverse', 'Play To Earn',
            ],
            'NFT & Digital Collectibles' => [
                'NFT',
            ],
            'Privacy' => [
                'Privacy', 'Privacy Coins', 'Privacy Infrastructure', 'Privacy Blockchain',
            ],
            'Cross-chain & Interop' => [
                'Cross-chain Communication', 'Chain Abstraction',
            ],
            'Oracle & Data' => [
                'Oracle', 'Analytics',
            ],
            'Social & Identity' => [
                'SocialFi', 'Decentralized Identifier (DID)',
            ],
            'Payments & Banking' => [
                'Payment Solutions', 'Crypto Card Issuer', 'Neobank', 'Wallets',
            ],
            'Prediction Markets & GambleFi' => [
                'Prediction Markets', 'Gambling (GambleFi)',
            ],
            'Storage & Compute' => [
                'Storage',
            ],
            'Meme' => [
                'Meme', 'Dog-Themed', 'Frog-Themed', 'Solana Meme',
                'Elon Musk-Inspired', '4chan-Themed', "The Boy's Club",
                'Trump-Affiliated', 'Emoji-Themed',
            ],
            'Liquid Staking' => [
                'Liquid Staking',
            ],
        ];

        foreach ($sectors as $narrative => $categories) {
            foreach ($categories as $category) {
                SectorMapping::updateOrCreate(
                    ['narrative_sector' => $narrative, 'coingecko_category' => $category],
                );
            }
        }
    }
}
