import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, message, Modal, Spin, Row, Col } from 'antd';
import { AptosClient, Types } from "aptos";
import { useWallet } from "@aptos-labs/wallet-adapter-react";

const { Meta } = Card;

interface NFT {
  id: number;
  name: string;
  description: string;
  uri: string;
  rarity: number;
}

const NFTFusion: React.FC<{ marketplaceAddr: string }> = ({ marketplaceAddr }) => {
  const [userNFTs, setUserNFTs] = useState<NFT[]>([]);
  const [selectedNFTs, setSelectedNFTs] = useState<NFT[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFusing, setIsFusing] = useState(false);
  const [fusionResult, setFusionResult] = useState<NFT | null>(null);
  const { account } = useWallet();
  const client = new AptosClient("https://fullnode.testnet.aptoslabs.com/v1");

  const fetchUserNFTs = useCallback(async () => {
    if (!account) return;
    setIsLoading(true);
    try {
      const response = await client.view({
        function: `${marketplaceAddr}::NFTMarketplace::get_all_nfts_for_owner`,
        type_arguments: [],
        arguments: [marketplaceAddr, account.address, "100", "0"],
      });

      const nftIds = Array.isArray(response[0]) ? response[0] : response;
      
      const nfts: NFT[] = await Promise.all(nftIds.map(async (id: number) => {
        const nftDetails = await client.view({
          function: `${marketplaceAddr}::NFTMarketplace::get_nft_details`,
          type_arguments: [],
          arguments: [marketplaceAddr, id],
        });

        return {
          id: Number(nftDetails[0]),
          name: new TextDecoder().decode(new Uint8Array(nftDetails[2] as number[])),
          description: new TextDecoder().decode(new Uint8Array(nftDetails[3] as number[])),
          uri: new TextDecoder().decode(new Uint8Array(nftDetails[4] as number[])),
          rarity: Number(nftDetails[7]),
        };
      }));

      setUserNFTs(nfts);
    } catch (error) {
      console.error("Error fetching user NFTs:", error);
      message.error("Failed to fetch your NFTs.");
    } finally {
      setIsLoading(false);
    }
  }, [account, marketplaceAddr]);

  useEffect(() => {
    if (account) {
      fetchUserNFTs();
    }
  }, [account, fetchUserNFTs]);

  const handleNFTSelect = (nft: NFT) => {
    if (selectedNFTs.find(selected => selected.id === nft.id)) {
      setSelectedNFTs(selectedNFTs.filter(selected => selected.id !== nft.id));
    } else if (selectedNFTs.length < 2) {
      setSelectedNFTs([...selectedNFTs, nft]);
    } else {
      message.warning("You can only select two NFTs for fusion.");
    }
  };

  const handleFusion = async () => {
    if (selectedNFTs.length !== 2) {
      message.error("Please select exactly two NFTs for fusion.");
      return;
    }

    setIsFusing(true);
    try {
      const payload: Types.TransactionPayload = {
        type: "entry_function_payload",
        function: `${marketplaceAddr}::NFTMarketplace::fuse_nfts`,
        type_arguments: [],
        arguments: [marketplaceAddr, selectedNFTs[0].id.toString(), selectedNFTs[1].id.toString()],
      };

      const response = await (window as any).aptos.signAndSubmitTransaction(payload);
      await client.waitForTransaction(response.hash);

      // Fetch the newly created NFT
      const newNFTResponse = await client.view({
        function: `${marketplaceAddr}::NFTMarketplace::get_last_minted_nft`,
        type_arguments: [],
        arguments: [marketplaceAddr, account!.address],
      });

      const newNFT: NFT = {
        id: Number(newNFTResponse[0]),
        name: new TextDecoder().decode(new Uint8Array(newNFTResponse[1] as number[])),
        description: new TextDecoder().decode(new Uint8Array(newNFTResponse[2] as number[])),
        uri: new TextDecoder().decode(new Uint8Array(newNFTResponse[3] as number[])),
        rarity: Number(newNFTResponse[4]),
      };

      setFusionResult(newNFT);
      message.success("NFT Fusion successful!");
      fetchUserNFTs(); // Refresh the user's NFTs
    } catch (error) {
      console.error("Error during NFT fusion:", error);
      message.error("Failed to fuse NFTs. Please try again.");
    } finally {
      setIsFusing(false);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>NFT Fusion Lab</h1>
      <p>Select two NFTs to fuse them into a new, potentially rarer NFT!</p>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {userNFTs.map(nft => (
              <Col key={nft.id} xs={24} sm={12} md={8} lg={6}>
                <Card
                  hoverable
                  style={{ width: 240, marginBottom: 16, border: selectedNFTs.find(selected => selected.id === nft.id) ? '2px solid #1890ff' : undefined }}
                  cover={<img alt={nft.name} src={nft.uri} style={{ height: 240, objectFit: 'cover' }} />}
                  onClick={() => handleNFTSelect(nft)}
                >
                  <Meta title={nft.name} description={`Rarity: ${nft.rarity}`} />
                </Card>
              </Col>
            ))}
          </Row>

          <Button 
            type="primary" 
            onClick={handleFusion} 
            disabled={selectedNFTs.length !== 2 || isFusing}
            loading={isFusing}
          >
            Fuse Selected NFTs
          </Button>

          <Modal
            title="Fusion Result"
            visible={!!fusionResult}
            onOk={() => setFusionResult(null)}
            onCancel={() => setFusionResult(null)}
          >
            {fusionResult && (
              <Card
                cover={<img alt={fusionResult.name} src={fusionResult.uri} />}
              >
                <Meta title={fusionResult.name} description={fusionResult.description} />
                <p>Rarity: {fusionResult.rarity}</p>
              </Card>
            )}
          </Modal>
        </>
      )}
    </div>
  );
};

export default NFTFusion;

