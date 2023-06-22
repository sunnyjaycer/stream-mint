// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.18;

import { SuperAppBaseFlow } from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBaseFlow.sol";
import { ISuperfluid, ISuperToken } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import { SuperTokenV1Library } from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperTokenV1Library.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title Storage
 * @dev Store & retrieve value in a variable
 * @custom:dev-run-script ./scripts/deploy_with_ethers.ts
 */
contract StreamMint is SuperAppBaseFlow, ERC721 {

    using SuperTokenV1Library for ISuperToken;

    ISuperToken public acceptedToken;
    int96 public inflowThreshold;

    /// @dev current token ID
    uint256 public tokenId;

    /// @dev mapping of accounts to their NFTs (ERC721 gives you token IDs to owners in _owners)
    mapping(address => uint256) public nftOwned;

    constructor(
        ISuperToken _acceptedToken,
        int96 _inflowThreshold,
        ISuperfluid _host
    ) SuperAppBaseFlow (
        _host,
        true,
        true,
        true
    ) ERC721 (
        "StreamMint",
        "SM"
    ) {

        acceptedToken = _acceptedToken;
        inflowThreshold = _inflowThreshold;

    }

    ///@dev checks that only the acceptedToken is used when sending streams into this contract
    ///@param superToken the token being streamed into the contract
    function isAcceptedSuperToken(ISuperToken superToken) public view override returns (bool) {
        return superToken == acceptedToken;
    }

    // ---------------------------------------------------------------------------------------------
    // CALLBACK LOGIC

    function onFlowCreated(
        ISuperToken superToken,
        address sender,
        bytes calldata ctx
    )
        internal
        override
        returns (bytes memory /*newCtx*/)
    {

        int96 inflowRate = superToken.getFlowRate(sender, address(this));

        if ( inflowRate >= inflowThreshold ) {

            tokenId++;
            _mint(sender, tokenId);
            nftOwned[sender] = tokenId;

        }

        return ctx;

    }

    function onFlowUpdated(
        ISuperToken superToken,
        address sender,
        int96 previousFlowRate,
        uint256 /*lastUpdated*/,
        bytes calldata ctx
    )
        internal
        override
        returns (bytes memory /*newCtx*/)
    {

        int96 inflowRate = superToken.getFlowRate(sender, address(this));

        if ( inflowRate >= inflowThreshold && previousFlowRate < inflowThreshold ) {


            tokenId++;
            _mint(sender, tokenId);
            nftOwned[sender] = tokenId;

        } else if ( inflowRate < inflowThreshold && previousFlowRate >= inflowThreshold ) {

            _burn(nftOwned[sender]);
            delete nftOwned[sender];

        }

        return ctx;

    }

    function onFlowDeleted(
        ISuperToken /*superToken*/,
        address sender,
        address /*receiver*/,
        int96 previousFlowRate,
        uint256 /*lastUpdated*/,
        bytes calldata ctx
    )
        internal
        override
        returns (bytes memory /*newCtx*/)
    {

        if ( previousFlowRate >= inflowThreshold ) {

            _burn(nftOwned[sender]);
            delete nftOwned[sender];

        }

        return ctx;

    }

}