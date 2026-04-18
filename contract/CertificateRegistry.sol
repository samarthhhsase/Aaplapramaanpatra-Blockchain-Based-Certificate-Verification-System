// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CertificateRegistry {
    struct Certificate {
        string certificateHash;
        string certificateId;
        string studentName;
        string course;
        address issuerAddress;
        uint256 issuedAt;
        bool revoked;
        bool exists;
    }

    address public immutable owner;
    mapping(string => Certificate) private certificates;

    event CertificateIssued(
        string indexed certificateId,
        string certificateHash,
        string studentName,
        string course,
        address indexed issuerAddress,
        uint256 issuedAt
    );

    event CertificateRevoked(
        string indexed certificateId,
        address indexed issuerAddress,
        uint256 revokedAt
    );

    event CertificateUpdated(
        string indexed certificateId,
        string previousCertificateHash,
        string nextCertificateHash,
        string studentName,
        string course,
        address indexed issuerAddress,
        uint256 updatedAt
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function issueCertificate(
        string memory certificateHash,
        string memory certificateId,
        string memory studentName,
        string memory course
    ) external onlyOwner {
        require(bytes(certificateHash).length > 0, "certificateHash required");
        require(bytes(certificateId).length > 0, "certificateId required");
        require(bytes(studentName).length > 0, "studentName required");
        require(bytes(course).length > 0, "course required");

        Certificate storage existingCertificate = certificates[certificateId];
        require(!existingCertificate.exists, "Certificate already exists");

        certificates[certificateId] = Certificate({
            certificateHash: certificateHash,
            certificateId: certificateId,
            studentName: studentName,
            course: course,
            issuerAddress: msg.sender,
            issuedAt: block.timestamp,
            revoked: false,
            exists: true
        });

        emit CertificateIssued(
            certificateId,
            certificateHash,
            studentName,
            course,
            msg.sender,
            block.timestamp
        );
    }

    function verifyCertificate(
        string memory certificateId
    )
        external
        view
        returns (
            string memory certificateHash,
            string memory storedCertificateId,
            string memory studentName,
            string memory course,
            address issuerAddress,
            uint256 issuedAt,
            bool revoked,
            bool exists
        )
    {
        Certificate memory certificate = certificates[certificateId];

        return (
            certificate.certificateHash,
            certificate.certificateId,
            certificate.studentName,
            certificate.course,
            certificate.issuerAddress,
            certificate.issuedAt,
            certificate.revoked,
            certificate.exists
        );
    }

    function revokeCertificate(string memory certificateId) external onlyOwner {
        require(bytes(certificateId).length > 0, "certificateId required");

        Certificate storage certificate = certificates[certificateId];
        require(certificate.exists, "Certificate not found");
        require(!certificate.revoked, "Certificate already revoked");

        certificate.revoked = true;

        emit CertificateRevoked(certificateId, msg.sender, block.timestamp);
    }

    function updateCertificate(
        string memory certificateId,
        string memory nextCertificateHash,
        string memory studentName,
        string memory course
    ) external onlyOwner {
        require(bytes(certificateId).length > 0, "certificateId required");
        require(bytes(nextCertificateHash).length > 0, "certificateHash required");
        require(bytes(studentName).length > 0, "studentName required");
        require(bytes(course).length > 0, "course required");

        Certificate storage certificate = certificates[certificateId];
        require(certificate.exists, "Certificate not found");
        require(!certificate.revoked, "Certificate revoked");

        string memory previousCertificateHash = certificate.certificateHash;
        certificate.certificateHash = nextCertificateHash;
        certificate.studentName = studentName;
        certificate.course = course;
        certificate.issuerAddress = msg.sender;
        certificate.issuedAt = block.timestamp;

        emit CertificateUpdated(
            certificateId,
            previousCertificateHash,
            nextCertificateHash,
            studentName,
            course,
            msg.sender,
            block.timestamp
        );
    }
}
