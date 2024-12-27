import React, { useState, useEffect, useCallback } from "react";
import { Typography, Radio, message, Card, Row, Col, Pagination, Tag, Button, Modal, Select, Input, Slider, DatePicker, Spin } from "antd";
import { AptosClient } from "aptos";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import moment from 'moment';

const { Title } = Typography;
const { Meta } = Card;
const { Option } = Select;
const { RangePicker } = DatePicker;

const client = new AptosClient("https://fullnode.testnet.aptoslabs.com/v1");

type NFT = {
  id: number;
  owner: string;
  name: string;
  description: string;
  uri: string;
  price: number;
  for_sale: boolean;
  rarity: number;
  listed_at: number;
};

interface MarketViewProps {
  marketplaceAddr: string;
}

const rarityColors: { [key: number]: string } = {
  1: "green",
  2: "blue",
  3: "purple",
  4: "orange",
};

const rarityLabels: { [key: number]: string } = {
  1: "Common",
  2: "Uncommon",
  3: "Rare",
  4: "Super Rare",
};

const truncateAddress = (address: string, start = 6, end = 4) => {
  return `${address.slice(0, start)}...${address.slice(-end)}`;
};

const MarketView: React.FC<MarketViewProps> = ({ marketplaceAddr }) => {
  const { signAndSubmitTransaction } = useWallet();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [filteredNfts, setFilteredNfts] = useState<NFT[]>([]);
  const [rarity, setRarity] = useState<'all' | number>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isBuyModalVisible, setIsBuyModalVisible] = useState(false);
  const [selectedNft, setSelectedNft] = useState<NFT | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pageSize = 8;

  // Advanced filtering and sorting state
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);
  const [dateRange, setDateRange] = useState<[moment.Moment | null, moment.Moment | null]>([null, null]);
  const [sortBy, setSortBy] = useState<string>('price_asc');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const fetchNfts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await client.getAccountResource(
        marketplaceAddr,
        `${marketplaceAddr}::NFTMarketplace::Marketplace`
      );
      const nftList = (response.data as { nfts: NFT[] }).nfts;

      const hexToUint8Array = (hexString: string): Uint8Array => {
        const bytes = new Uint8Array(hexString.length / 2);
        for (let i = 0; i < hexString.length; i += 2) {
          bytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
        }
        return bytes;
      };

      const decodedNfts = nftList.map((nft) => ({
        ...nft,
        name: new TextDecoder().decode(hexToUint8Array(nft.name.slice(2))),
        description: new TextDecoder().decode(hexToUint8Array(nft.description.slice(2))),
        uri: new TextDecoder().decode(hexToUint8Array(nft.uri.slice(2))),
        price: nft.price / 100000000,
        listed_at: nft.listed_at || Date.now(),
      }));

      setNfts(decodedNfts);
      setFilteredNfts(decodedNfts);
    } catch (error) {
      console.error("Error fetching NFTs:", error);
      message.error("Failed to fetch NFTs.");
    } finally {
      setIsLoading(false);
    }
  }, [marketplaceAddr]);

  useEffect(() => {
    fetchNfts();
  }, [fetchNfts]);

  const handleBuyClick = (nft: NFT) => {
    setSelectedNft(nft);
    setIsBuyModalVisible(true);
  };

  const handleCancelBuy = () => {
    setIsBuyModalVisible(false);
    setSelectedNft(null);
  };

  const handleConfirmPurchase = async () => {
    if (!selectedNft) return;
  
    try {
      const priceInOctas = selectedNft.price * 100000000;
  
      const entryFunctionPayload = {
        type: "entry_function_payload",
        function: `${marketplaceAddr}::NFTMarketplace::purchase_nft`,
        type_arguments: [],
        arguments: [marketplaceAddr, selectedNft.id.toString(), priceInOctas.toString()],
      };
  
      const response = await (window as any).aptos.signAndSubmitTransaction(entryFunctionPayload);
      await client.waitForTransaction(response.hash);
  
      message.success("NFT purchased successfully!");
      setIsBuyModalVisible(false);
      fetchNfts();
    } catch (error) {
      console.error("Error purchasing NFT:", error);
      message.error("Failed to purchase NFT.");
    }
  };

  const applyFilters = useCallback(() => {
    let filtered = nfts;

    // Filter by rarity
    if (rarity !== 'all') {
      filtered = filtered.filter((nft) => nft.rarity === rarity);
    }

    // Filter by price range
    filtered = filtered.filter((nft) => nft.price >= priceRange[0] && nft.price <= priceRange[1]);

    // Filter by date range
    if (dateRange[0] && dateRange[1]) {
      filtered = filtered.filter((nft) => {
        const listedDate = moment(nft.listed_at);
        return listedDate.isBetween(dateRange[0], dateRange[1], null, '[]');
      });
    }

    // Filter by search term
    if (searchTerm) {
      const lowercaseTerm = searchTerm.toLowerCase();
      filtered = filtered.filter((nft) =>
        nft.name.toLowerCase().includes(lowercaseTerm) ||
        nft.description.toLowerCase().includes(lowercaseTerm)
      );
    }

    // Apply sorting
    switch (sortBy) {
      case 'price_asc':
        filtered.sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        filtered.sort((a, b) => b.price - a.price);
        break;
      case 'date_asc':
        filtered.sort((a, b) => a.listed_at - b.listed_at);
        break;
      case 'date_desc':
        filtered.sort((a, b) => b.listed_at - a.listed_at);
        break;
      case 'rarity_asc':
        filtered.sort((a, b) => a.rarity - b.rarity);
        break;
      case 'rarity_desc':
        filtered.sort((a, b) => b.rarity - a.rarity);
        break;
    }

    setFilteredNfts(filtered);
    setCurrentPage(1);
  }, [nfts, rarity, priceRange, dateRange, searchTerm, sortBy]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const paginatedNfts = filteredNfts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div style={{ padding: "20px" }}>
      <Title level={2} style={{ marginBottom: "20px" }}>NFT Marketplace</Title>
      
      {/* Advanced Filtering and Sorting Controls */}
      <div style={{ marginBottom: "20px" }}>
        <Input
          placeholder="Search by name or description"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: 200, marginRight: 16 }}
        />
        <Select
          defaultValue="all"
          style={{ width: 120, marginRight: 16 }}
          onChange={(value) => setRarity(value === 'all' ? 'all' : Number(value))}
        >
          <Option value="all">All Rarities</Option>
          <Option value="1">Common</Option>
          <Option value="2">Uncommon</Option>
          <Option value="3">Rare</Option>
          <Option value="4">Super Rare</Option>
        </Select>
        <Select
          defaultValue="price_asc"
          style={{ width: 120, marginRight: 16 }}
          onChange={(value) => setSortBy(value)}
        >
          <Option value="price_asc">Price: Low to High</Option>
          <Option value="price_desc">Price: High to Low</Option>
          <Option value="date_asc">Date: Oldest First</Option>
          <Option value="date_desc">Date: Newest First</Option>
          <Option value="rarity_asc">Rarity: Common to Rare</Option>
          <Option value="rarity_desc">Rarity: Rare to Common</Option>
        </Select>
      </div>
      <div style={{ marginBottom: "20px" }}>
        <span style={{ marginRight: 8 }}>Price Range:</span>
        <Slider
          range
          min={0}
          max={1000}
          defaultValue={[0, 1000]}
          onChange={(value) => setPriceRange(value as [number, number])}
          style={{ width: 200, display: 'inline-block', marginRight: 16 }}
        />
        <span style={{ marginRight: 8 }}>Date Listed:</span>
        <RangePicker
          onChange={(dates) => setDateRange(dates as [moment.Moment, moment.Moment])}
        />
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {paginatedNfts.map((nft) => (
              <Col xs={24} sm={12} md={8} lg={6} key={nft.id}>
                <Card
                  hoverable
                    cover={<img alt={nft.name} src={nft.uri} style={{ height: 200, objectFit: 'cover' }} />}
                  actions={[
                    <Button type="primary" onClick={() => handleBuyClick(nft)}>
                      Buy
                    </Button>
                  ]}
                >
                  <Tag color={rarityColors[nft.rarity]} style={{ marginBottom: 8 }}>
                    {rarityLabels[nft.rarity]}
                  </Tag>
                  <Meta title={nft.name} description={`${nft.price} APT`} />
                  <p style={{ marginTop: 8 }}>{nft.description}</p>
                  <p>Owner: {truncateAddress(nft.owner)}</p>
                  <p>Listed: {moment(nft.listed_at).format('MMMM Do YYYY')}</p>
                </Card>
              </Col>
            ))}
          </Row>
          <Pagination
            current={currentPage}
            pageSize={pageSize}
            total={filteredNfts.length}
            onChange={(page) => setCurrentPage(page)}
            style={{ marginTop: 20, textAlign: 'center' }}
          />
        </>
      )}

      <Modal
        title="Purchase NFT"
        open={isBuyModalVisible}
        onCancel={handleCancelBuy}
        footer={[
          <Button key="cancel" onClick={handleCancelBuy}>
            Cancel
          </Button>,
          <Button key="confirm" type="primary" onClick={handleConfirmPurchase}>
            Confirm Purchase
          </Button>,
        ]}
      >
        {selectedNft && (
          <>
            <p><strong>NFT ID:</strong> {selectedNft.id}</p>
            <p><strong>Name:</strong> {selectedNft.name}</p>
            <p><strong>Description:</strong> {selectedNft.description}</p>
            <p><strong>Rarity:</strong> {rarityLabels[selectedNft.rarity]}</p>
            <p><strong>Price:</strong> {selectedNft.price} APT</p>
            <p><strong>Owner:</strong> {truncateAddress(selectedNft.owner)}</p>
          </>
        )}
      </Modal>
    </div>
  );
};

export default MarketView;