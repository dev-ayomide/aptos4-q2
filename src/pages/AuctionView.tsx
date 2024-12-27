import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Card, Row, Col, Button, Input, message, Modal, Pagination, Spin } from 'antd';
import { AptosClient, Types } from "aptos";
import { useWallet } from "@aptos-labs/wallet-adapter-react";

const { Title } = Typography;
const { Meta } = Card;

const client = new AptosClient("https://fullnode.testnet.aptoslabs.com/v1");

interface Auction {
  id: number;
  nftId: number;
  seller: string;
  startingPrice: number;
  currentBid: number;
  highestBidder: string;
  endTime: number;
  nftDetails: {
    name: string;
    description: string;
    uri: string;
    rarity: number;
  };
}

const AuctionView: React.FC<{ marketplaceAddr: string }> = ({ marketplaceAddr }) => {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null);
  const [bidAmount, setBidAmount] = useState<string>("");
  const [isBidModalVisible, setIsBidModalVisible] = useState(false);
  const { account } = useWallet();
  const pageSize = 8;

  const fetchAuctions = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await client.view({
        function: `${marketplaceAddr}::NFTMarketplace::get_all_auctions`,
        type_arguments: [],
        arguments: [],
      });

      if (Array.isArray(response[0])) {
        const fetchedAuctions: Auction[] = response[0].map((auction: any) => ({
          id: auction.id,
          nftId: auction.nft_id,
          seller: auction.seller,
          startingPrice: auction.starting_price / 100000000,
          currentBid: auction.current_bid / 100000000,
          highestBidder: auction.highest_bidder,
          endTime: auction.end_time,
          nftDetails: {
            name: new TextDecoder().decode(new Uint8Array(auction.nft_details.name)),
            description: new TextDecoder().decode(new Uint8Array(auction.nft_details.description)),
            uri: new TextDecoder().decode(new Uint8Array(auction.nft_details.uri)),
            rarity: auction.nft_details.rarity,
          },
        }));

        setAuctions(fetchedAuctions);
      }
    } catch (error) {
      console.error("Error fetching auctions:", error);
      message.error("Failed to fetch auctions.");
    } finally {
      setIsLoading(false);
    }
  }, [marketplaceAddr]);

  useEffect(() => {
    fetchAuctions();
    // Set up interval to refresh auctions
    const interval = setInterval(fetchAuctions, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchAuctions]);

  const handleBidClick = (auction: Auction) => {
    if (!account) {
      message.warning("Please connect your wallet to place a bid");
      return;
    }
    setSelectedAuction(auction);
    setIsBidModalVisible(true);
  };

  const handleBidCancel = () => {
    setIsBidModalVisible(false);
    setSelectedAuction(null);
    setBidAmount("");
  };

  const handleBidSubmit = async () => {
    if (!selectedAuction || !bidAmount || !account) return;

    try {
      const bidAmountOctas = parseFloat(bidAmount) * 100000000;

      const payload: Types.TransactionPayload = {
        type: "entry_function_payload",
        function: `${marketplaceAddr}::NFTMarketplace::place_bid`,
        type_arguments: [],
        arguments: [marketplaceAddr, selectedAuction.id.toString(), bidAmountOctas.toString()]
      };

      const response = await (window as any).aptos.signAndSubmitTransaction(payload);
      await client.waitForTransaction(response.hash);

      message.success("Bid placed successfully!");
      setIsBidModalVisible(false);
      setBidAmount("");
      fetchAuctions();
    } catch (error) {
      console.error("Error placing bid:", error);
      message.error("Failed to place bid. Please try again.");
    }
  };

  const paginatedAuctions = auctions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const isAuctionEnded = (endTime: number) => {
    return Date.now() > endTime * 1000;
  };

  return (
    <div style={{ padding: "20px" }}>
      <Title level={2}>Active Auctions</Title>
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {paginatedAuctions.map((auction) => (
              <Col xs={24} sm={12} md={8} lg={6} key={auction.id}>
                <Card
                  hoverable
                  cover={<img alt={auction.nftDetails.name} src={auction.nftDetails.uri} style={{ height: 200, objectFit: 'cover' }} />}
                >
                  <Meta
                    title={auction.nftDetails.name}
                    description={auction.nftDetails.description}
                  />
                  <div style={{ marginTop: 16 }}>
                    <p>Current Bid: {auction.currentBid} APT</p>
                    <p>Starting Price: {auction.startingPrice} APT</p>
                    <p>Ends: {new Date(auction.endTime * 1000).toLocaleString()}</p>
                    {!isAuctionEnded(auction.endTime) && (
                      <Button
                        type="primary"
                        onClick={() => handleBidClick(auction)}
                        disabled={account?.address === auction.seller}
                      >
                        Place Bid
                      </Button>
                    )}
                    {isAuctionEnded(auction.endTime) && (
                      <Button disabled>Auction Ended</Button>
                    )}
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
          <Pagination
            current={currentPage}
            pageSize={pageSize}
            total={auctions.length}
            onChange={(page) => setCurrentPage(page)}
            style={{ marginTop: 20, textAlign: 'center' }}
          />
        </>
      )}

      <Modal
        title="Place Bid"
        open={isBidModalVisible}
        onCancel={handleBidCancel}
        footer={[
          <Button key="cancel" onClick={handleBidCancel}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            onClick={handleBidSubmit}
            disabled={!bidAmount || (selectedAuction && parseFloat(bidAmount) <= selectedAuction.currentBid)}
          >
            Place Bid
          </Button>,
        ]}
      >
        {selectedAuction && (
          <>
            <p>NFT: {selectedAuction.nftDetails.name}</p>
            <p>Current Highest Bid: {selectedAuction.currentBid} APT</p>
            <p>Minimum Bid: {(selectedAuction.currentBid + 0.1).toFixed(1)} APT</p>
            <Input
              type="number"
              placeholder="Enter bid amount in APT"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              min={selectedAuction.currentBid + 0.1}
              step={0.1}
              style={{ marginTop: 16 }}
            />
          </>
        )}
      </Modal>
    </div>
  );
};

export default AuctionView;