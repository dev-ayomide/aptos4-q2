import React, { useEffect, useState, useCallback } from "react";
import { Typography, Card, Row, Col, Pagination, message, Button, Input, Modal, DatePicker, Spin } from "antd";
import { AptosClient, Types } from "aptos";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import moment from 'moment';

const { Title } = Typography;
const { Meta } = Card;

const client = new AptosClient("https://fullnode.testnet.aptoslabs.com/v1");

type NFT = {
  id: number;
  name: string;
  description: string;
  uri: string;
  rarity: number;
  price: number;
  for_sale: boolean;
};

const MyNFTs: React.FC = () => {
  const pageSize = 8;
  const [currentPage, setCurrentPage] = useState(1);
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [totalNFTs, setTotalNFTs] = useState(0);
  const { account } = useWallet();
  const marketplaceAddr = "0x75cfca25296896f907a457e20a245f9af304cb1e48723d864e17f2e08ad93159";

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedNft, setSelectedNft] = useState<NFT | null>(null);
  const [salePrice, setSalePrice] = useState<string>("");
  const [isAuctionModalVisible, setIsAuctionModalVisible] = useState(false);
  const [auctionStartingPrice, setAuctionStartingPrice] = useState<string>("");
  const [auctionEndTime, setAuctionEndTime] = useState<moment.Moment | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchUserNFTs = useCallback(async () => {
    if (!account) return;

    setIsLoading(true);
    try {
      console.log("Fetching NFT IDs for owner:", account.address);

      const nftIdsResponse = await client.view({
        function: `${marketplaceAddr}::NFTMarketplace::get_all_nfts_for_owner`,
        arguments: [marketplaceAddr, account.address, "100", "0"],
        type_arguments: [],
      });

      const nftIds = Array.isArray(nftIdsResponse[0]) ? nftIdsResponse[0] : nftIdsResponse;
      setTotalNFTs(nftIds.length);

      if (nftIds.length === 0) {
        console.log("No NFTs found for the owner.");
        setNfts([]);
        return;
      }

      console.log("Fetching details for each NFT ID:", nftIds);

      const userNFTs = (await Promise.all(
        nftIds.map(async (id) => {
          try {
            const nftDetails = await client.view({
              function: `${marketplaceAddr}::NFTMarketplace::get_nft_details`,
              arguments: [marketplaceAddr, id],
              type_arguments: [],
            });

            const [nftId, _owner, name, description, uri, price, forSale, rarity] = nftDetails as [
              number,
              string,
              string,
              string,
              string,
              number,
              boolean,
              number
            ];

            const hexToUint8Array = (hexString: string): Uint8Array => {
              const bytes = new Uint8Array(hexString.length / 2);
              for (let i = 0; i < hexString.length; i += 2) {
                bytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
              }
              return bytes;
            };

            return {
              id: nftId,
              name: new TextDecoder().decode(hexToUint8Array(name.slice(2))),
              description: new TextDecoder().decode(hexToUint8Array(description.slice(2))),
              uri: new TextDecoder().decode(hexToUint8Array(uri.slice(2))),
              rarity,
              price: price / 100000000, // Convert octas to APT
              for_sale: forSale,
            };
          } catch (error) {
            console.error(`Error fetching details for NFT ID ${id}:`, error);
            return null;
          }
        })
      )).filter((nft): nft is NFT => nft !== null);

      console.log("User NFTs:", userNFTs);
      setNfts(userNFTs);
    } catch (error) {
      console.error("Error fetching NFTs:", error);
      message.error("Failed to fetch your NFTs.");
    } finally {
      setIsLoading(false);
    }
  }, [account, marketplaceAddr]);

  const handleSellClick = (nft: NFT) => {
    setSelectedNft(nft);
    setIsModalVisible(true);
  };

  const handleAuctionClick = (nft: NFT) => {
    setSelectedNft(nft);
    setIsAuctionModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setIsAuctionModalVisible(false);
    setSelectedNft(null);
    setSalePrice("");
    setAuctionStartingPrice("");
    setAuctionEndTime(null);
  };

  const handleConfirmListing = async () => {
    if (!selectedNft || !salePrice) return;
  
    try {
      const priceInOctas = parseFloat(salePrice) * 100000000;
  
      const entryFunctionPayload = {
        type: "entry_function_payload",
        function: `${marketplaceAddr}::NFTMarketplace::list_for_sale`,
        type_arguments: [],
        arguments: [marketplaceAddr, selectedNft.id.toString(), priceInOctas.toString()],
      };
  
      const response = await (window as any).aptos.signAndSubmitTransaction(entryFunctionPayload);
      await client.waitForTransaction(response.hash);
  
      message.success("NFT listed for sale successfully!");
      setIsModalVisible(false);
      setSalePrice("");
      fetchUserNFTs();
    } catch (error) {
      console.error("Error listing NFT for sale:", error);
      message.error("Failed to list NFT for sale.");
    }
  };

  const handleConfirmAuction = () => {
    if (!selectedNft || !auctionStartingPrice || !auctionEndTime) return;
    createAuction(selectedNft.id, auctionStartingPrice, auctionEndTime);
  };

  const createAuction = async (nftId: number, startingPrice: string, endTime: moment.Moment) => {
    if (!account) {
      message.error("Please connect your wallet to create an auction.");
      return;
    }

    try {
      const startingPriceOctas = parseFloat(startingPrice) * 100000000;
      const endTimeUnix = endTime.unix();

      const payload: Types.TransactionPayload = {
        type: "entry_function_payload",
        function: `${marketplaceAddr}::NFTMarketplace::create_auction`,
        type_arguments: [],
        arguments: [marketplaceAddr, nftId.toString(), startingPriceOctas.toString(), endTimeUnix.toString()]
      };

      const response = await (window as any).aptos.signAndSubmitTransaction(payload);
      await client.waitForTransaction(response.hash);

      message.success("Auction created successfully!");
      setIsAuctionModalVisible(false);
      setAuctionStartingPrice("");
      setAuctionEndTime(null);
      fetchUserNFTs();
    } catch (error) {
      console.error("Error creating auction:", error);
      message.error("Failed to create auction. Please try again.");
    }
  };

  useEffect(() => {
    fetchUserNFTs();
  }, [fetchUserNFTs, currentPage]);

  const paginatedNFTs = nfts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div
      style={{
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <Title level={2} style={{ marginBottom: "20px" }}>My Collection</Title>
      <p>Your personal collection of NFTs.</p>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Row
            gutter={[24, 24]}
            style={{
              marginTop: 20,
              width: "100%",
              maxWidth: "100%",
              display: "flex",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {paginatedNFTs.map((nft) => (
              <Col
                key={nft.id}
                xs={24} sm={12} md={8} lg={8} xl={6}
                style={{
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <Card
                  hoverable
                  style={{
                    width: "100%",
                    maxWidth: "280px",
                    minWidth: "220px",
                    margin: "0 auto",
                  }}
                  cover={<img alt={nft.name} src={nft.uri} />}
                  actions={[
                    <Button type="link" onClick={() => handleSellClick(nft)}>
                      Sell
                    </Button>,
                    <Button type="link" onClick={() => handleAuctionClick(nft)}>
                      Auction
                    </Button>
                  ]}
                >
                  <Meta title={nft.name} description={`Rarity: ${nft.rarity}, Price: ${nft.price} APT`} />
                  <p>ID: {nft.id}</p>
                  <p>{nft.description}</p>
                  <p style={{ margin: "10px 0" }}>For Sale: {nft.for_sale ? "Yes" : "No"}</p>
                </Card>
              </Col>
            ))}
          </Row>

          <div style={{ marginTop: 30, marginBottom: 30 }}>
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={totalNFTs}
              onChange={(page) => setCurrentPage(page)}
              style={{ display: "flex", justifyContent: "center" }}
            />
          </div>
        </>
      )}

      <Modal
        title="Sell NFT"
        visible={isModalVisible}
        onCancel={handleCancel}
        footer={[
          <Button key="cancel" onClick={handleCancel}>
            Cancel
          </Button>,
          <Button key="confirm" type="primary" onClick={handleConfirmListing}>
            Confirm Listing
          </Button>,
        ]}
      >
        {selectedNft && (
          <>
            <p><strong>NFT ID:</strong> {selectedNft.id}</p>
            <p><strong>Name:</strong> {selectedNft.name}</p>
            <p><strong>Description:</strong> {selectedNft.description}</p>
            <p><strong>Rarity:</strong> {selectedNft.rarity}</p>
            <p><strong>Current Price:</strong> {selectedNft.price} APT</p>

            <Input
              type="number"
              placeholder="Enter sale price in APT"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              style={{ marginTop: 10 }}
            />
          </>
        )}
      </Modal>

      <Modal
        title="Create Auction"
        visible={isAuctionModalVisible}
        onCancel={handleCancel}
        footer={[
          <Button key="cancel" onClick={handleCancel}>
            Cancel
          </Button>,
          <Button key="confirm" type="primary" onClick={handleConfirmAuction}>
            Create Auction
          </Button>,
        ]}
      >
        {selectedNft && (
          <>
            <p><strong>NFT ID:</strong> {selectedNft.id}</p>
            <p><strong>Name:</strong> {selectedNft.name}</p>
            <p><strong>Description:</strong> {selectedNft.description}</p>
            <p><strong>Rarity:</strong> {selectedNft.rarity}</p>

            <Input
              type="number"
              placeholder="Enter starting price in APT"
              value={auctionStartingPrice}
              onChange={(e) => setAuctionStartingPrice(e.target.value)}
              style={{ marginTop: 10, marginBottom: 10 }}
            />
            <DatePicker
              showTime
              placeholder="Select auction end time"
              onChange={(value) => setAuctionEndTime(value)}
              style={{ width: '100%' }}
            />
          </>
        )}
      </Modal>
    </div>
  );  
};

export default MyNFTs;

