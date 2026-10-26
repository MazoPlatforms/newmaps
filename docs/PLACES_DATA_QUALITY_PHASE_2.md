# Phase 2 Places data quality cleanup report

The score ranks investigation priority only; it is not a probability that a place is fake.

## Changes

- Names normalized: 559
- Addresses normalized: 954
- Comprehensive Title Case changes on active records: 557 (complete before/after list in the JSON report)
- Exact duplicate groups consolidated: 695
- Records retired with permanent ULID aliases: 1039
- Canonical records retained: 695
- Unresolved duplicate groups: 172
- Active Places: 3694 → 2655

Exact before/after values, affected ULIDs, all conflict fields, evidence states, and retired-record backups are in `../reports/places-data-quality-phase-2.json`.

## Complete name changes (559 records)

| ULID | Before | After | Record state |
|---|---|---|---|
| `01M5W5PQFJ5CVPDMQXZA65B6RQ` | Dr Mobile Phones and Accessories | Dr Mobile Phones And Accessories | active |
| `01M5W5PQFK4Z16FC9V3ED6D6ER` | Prince Hardware & Electricals Pvt Ltd. | Prince Hardware & Electricals PVT Ltd. | active |
| `01M5W5PQFM613J1XP0VSBYNMHN` | iTunes lanka | iTunes Lanka | active |
| `01M5W5PQFMF5P9JFYMM8TQ22W3` | Mobile Care kattankudy | Mobile Care Kattankudy | active |
| `01M5W5PQFMM3J4QDR3YWC0W2C2` | Ranmuthu jew kky | Ranmuthu Jew Kky | active |
| `01M5W5PQFMW3QPFNYHKFJ6P2Z0` | Al Ain jewellery | Al Ain Jewellery | active |
| `01M5W5PQFNRFDEASJJF776CWCS` | E-deal | E-Deal | active |
| `01M5W5PQFP3B50T61Q85GH8241` | Zainab jewelry | Zainab Jewelry | active |
| `01M5W5PQFP53G3GYK0S0ZPCFW6` | Aathika motors | Aathika Motors | active |
| `01M5W5PQFP5R5R19NSB0N79EKP` | Junaid sir phone shop ( Fainaz phone repairing center) | Junaid Sir Phone Shop ( Fainaz Phone Repairing Center) | active |
| `01M5W5PQFQP5MYZNJ7T7EAEZCY` | Cheap multi shop | Cheap Multi Shop | active |
| `01M5W5PQFQWSWJ6KMF0T4N956R` | Multy corner | Multy Corner | active |
| `01M5W5PQFRE1Q1XRY54TJX64JP` | Gnh star | Gnh Star | active |
| `01M5W5PQFRN3572KE90KYSH97H` | Silver jewel mart | Silver Jewel Mart | active |
| `01M5W5PQFSRCWZC2TQDYXA2MP5` | A One Jewels Pvt Ltd | A One Jewels PVT Ltd | active |
| `01M5W5PQFT4G71H4Q9DE4KKKS1` | Abs mobiles | Abs Mobiles | active |
| `01M5W5PQFTS3J5GB7KQ91TZCA0` | Asian mobile | Asian Mobile | active |
| `01M5W5PQFXATW4RXQFX5V5GGSQ` | LIMRA motors | LIMRA Motors | active |
| `01M5W5PQFXBECGAPJAP2X98H1K` | Ranmuthu jewellery | Ranmuthu Jewellery | active |
| `01M5W5PQFXHPC0KPEFYJ3GT523` | Imaza Hardware and Electricals | Imaza Hardware And Electricals | active |
| `01M5W5PQFZ7H90F700EWWP0JE4` | Mobile expert | Mobile Expert | active |
| `01M5W5PQFZV79ZNEFJDA4KTD7R` | Naseela Tiles (Pvt) Ltd | Naseela Tiles (PVT) Ltd | active |
| `01M5W5PQG09CCN8X4T7F6QX7TJ` | Western jewellers | Western Jewellers | active |
| `01M5W5PQG0VYN7J27RMY5W8DGX` | New Dubai Fashion kattankudy | New Dubai Fashion Kattankudy | active |
| `01M5W5PQG1AXSYNEDFZ1MA2BWC` | Si jewellery | Si Jewellery | active |
| `01M5W5PQG1XJGWND772KPRKTPT` | Ba7 enterprises | Ba7 Enterprises | active |
| `01M5W5PQG2WY8B3E5315QH8Y6M` | Faleel store | Faleel Store | active |
| `01M5W5PQG3ST7XCK33JN721EHE` | Zeus modifieds | Zeus Modifieds | active |
| `01M5W5PQG49JW345E36CA0A6YP` | Boom Computers and Phones | Boom Computers And Phones | active |
| `01M5W5PQG4H758KHTBWVG031CZ` | Hm cellular service | Hm Cellular Service | active |
| `01M5W5PQG7CPA9EJ1HBS9BQY6H` | I Planet lanka | I Planet Lanka | active |
| `01M5W5PQGAZ9TXDMK8ZHX0YVGB` | Batti lagoon hotel | Batti Lagoon Hotel | active |
| `01M5W5PQGAZQZ48N25TSAS4AF5` | Yoyo holiday's inn | Yoyo Holiday's Inn | active |
| `01M5W5PQGBQ2VB95AHH9HG3124` | Cleopatra villa | Cleopatra Villa | active |
| `01M5W5PQGE7F3TMGMT0773S2S5` | Green Garden Hotel Batticaloa Pvt | Green Garden Hotel Batticaloa PVT | active |
| `01M5W5PQGF0TCQJJ5Y521NBD19` | Dutch beach rest inn | Dutch Beach Rest Inn | active |
| `01M5W5PQGFVYW0Q9M4MSP5TBTB` | Neverbeen to Lagoon Town | Neverbeen To Lagoon Town | active |
| `01M5W5PQGG7GTBWS9238F9CCPD` | Olifant Hall and Guest House | Olifant Hall And Guest House | active |
| `01M5W5PQGGQNZ6KGZFXT0HFE1Q` | Sun and Sand Resort | Sun And Sand Resort | active |
| `01M5W5PQGMSRHFEJQCGM1FR6JW` | Winlands Agro and Food Enterprises | Winlands Agro And Food Enterprises | active |
| `01M5W5PQGMWZTX78ZAQV03QAA3` | KS Farm and Agribusiness | KS Farm And Agribusiness | active |
| `01M5W5PQGN9VRCH2MZCVPNM203` | Pure honey | Pure Honey | active |
| `01M5W5PQGNF1HM7MDYX0Q133QF` | Oceanic farm | Oceanic Farm | active |
| `01M5W5PQGNVPHD3F2CPG9MYK35` | Musafik home | Musafik Home | active |
| `01M5W5PQGP3H3N60YKQFA53760` | Cactus Home - only wholesale | Cactus Home - Only Wholesale | active |
| `01M5W5PQGPNEDJKF2H327N7KTG` | K.T.K farm | K.T.K Farm | active |
| `01M5W5PQGPS44HQR6ZJAAGXQJD` | Sam shrimp farm | Sam Shrimp Farm | active |
| `01M5W5PQGPWDPKAWYQR4NQAR1A` | Agriculture and agrarian insurance board | Agriculture And Agrarian Insurance Board | active |
| `01M5W5PQGPXWFXX33NC2Z9Y562` | Department of Agriculture (Extension), Batticaloa | Department Of Agriculture (Extension), Batticaloa | active |
| `01M5W5PQGPZXGBYY4W3MQ7N9DS` | Healthy farm and agri business | Healthy Farm And Agri Business | active |
| `01M5W5PQGQ0FTAPW1J83PDFVW8` | Naz farm | Naz Farm | active |
| `01M5W5PQGQH73JYEF1YP0KBKXD` | Kandy Spices Agro (Pvt) Ltd, Batticaloa Branch | Kandy Spices Agro (PVT) Ltd, Batticaloa Branch | active |
| `01M5W5PQGRG22E31TC8BN172JX` | Jegathees dairy factory | Jegathees Dairy Factory | active |
| `01M5W5PQGRJ5SZFAMEQKMA5DHX` | KTLife farm | KTLife Farm | active |
| `01M5W5PQGRMMG66SPZNCSCZB31` | Agro Momentum (Pvt) Ltd | Agro Momentum (PVT) Ltd | active |
| `01M5W5PQGRNM8SERJQ8R070JAH` | Mr&Mrs Agro plant nursery | Mr&Mrs Agro Plant Nursery | active |
| `01M5W5PQGTF6SPKSP951C7M0AA` | Batticaloa guppy farm | Batticaloa Guppy Farm | active |
| `01M5W5PQGTFHSK382F4EZ2HT4F` | G K Thrust Integrated Farming`and Research Center | G K Thrust Integrated Farming`And Research Center | active |
| `01M5W5PQGTG9ZQQ4CZXBHHK2FJ` | Mermira Food and Beverages sri lanka | Mermira Food And Beverages Sri Lanka | active |
| `01M5W5PQGTQNPWQ9MWK7S8YTKC` | Maniwannan fish market | Maniwannan Fish Market | active |
| `01M5W5PQGVFPHHMQTSKFZGX8R1` | Mayurapura cashew farm | Mayurapura Cashew Farm | active |
| `01M5W5PQGWFZTCHS2AJ2TFZBDS` | mwpf Fish Farm batticaloa Junction | Mwpf Fish Farm Batticaloa Junction | active |
| `01M5W5PQGWQ4YJRR4D6A0J4G9N` | Office of the Assistant Director of Agriculture (ext) | Office Of The Assistant Director Of Agriculture (Ext) | active |
| `01M5W5PQGXKFF8TGA2BR5H5D4V` | Yogen Agro center | Yogen Agro Center | active |
| `01M5W5PQGY45DR4TC1TVFC3ZEB` | AKB- Hyderabad Estate Agro-Tourism and Farming Trust | AKB- Hyderabad Estate Agro-Tourism And Farming Trust | active |
| `01M5W5PQGZ1C0GM70N5BSKG7P4` | Gokulam farm | Gokulam Farm | active |
| `01M5W5PQGZC17MS1W0HWPP45K7` | Lee farm | Lee Farm | active |
| `01M5W5PQH08E07HMJSRCFS15V1` | Venture Greens (Pvt) Ltd - Batticaloa Branch | Venture Greens (PVT) Ltd - Batticaloa Branch | active |
| `01M5W5PQH0BAZFRJH7DW5W3DND` | Lavan Paddy field | Lavan Paddy Field | active |
| `01M5W5PQH0VB80HXJB7FK446FJ` | Batticaloa vavunathevu | Batticaloa Vavunathevu | active |
| `01M5W5PQH0VXBTGKAPCH95JHPF` | Vathiyar thoodam | Vathiyar Thoodam | active |
| `01M5W5PQH0XDKR54E2TQKW544T` | VVN farm | VVN Farm | active |
| `01M5W5PQH14TFF9NC56WZ376M6` | Plants for Sale | Plants For Sale | active |
| `01M5W5PQH2EGQ5NRKCAFZ87487` | Amana Bank \| SBC \| Kattankudy beach Road | Amana Bank \| SBC \| Kattankudy Beach Road | active |
| `01M5W5PQH2NKD56H0DXMETQHXZ` | Sampath bank ATM | Sampath Bank ATM | active |
| `01M5W5PQH3HADAV1JAK3H20ZXJ` | My fashion | My Fashion | active |
| `01M5W5PQH4BKS697STASCMKAZT` | East Lanka Auto Parts (Pvt) Ltd | East Lanka Auto Parts (PVT) Ltd | active |
| `01M5W5PQH4SSGV0SBJ72KR02WY` | Hajar motors and auto parts(pvt) ltd. | Hajar Motors And Auto Parts(PVT) Ltd. | active |
| `01M5W5PQH5ZH2Q1BVY0M93NNMK` | Auto spare parts | Auto Spare Parts | active |
| `01M5W5PQH65G3YE676YCQZ4W0E` | Kandy Motors Bike Repair shop | Kandy Motors Bike Repair Shop | active |
| `01M5W5PQH66MBFY0QHAQGC2EBQ` | Jazeer motors | Jazeer Motors | active |
| `01M5W5PQH6GN7CC3XHTCQSQ170` | Hajar auto parts mortors | Hajar Auto Parts Mortors | active |
| `01M5W5PQH7843QG88Y91WHE00C` | Akram motors | Akram Motors | active |
| `01M5W5PQH7S59EMNMJPGNKVSFF` | Barakath sarvice center | Barakath Sarvice Center | active |
| `01M5W5PQH83HSP3GFBF7SMRTSB` | Cheap palace for Motor Bike, Three wheels & Bicycle parts | Cheap Palace For Motor Bike, Three Wheels & Bicycle Parts | active |
| `01M5W5PQH8EH7808CTD3KNJ1Q3` | AR Brothers polishing and detailing shop | AR Brothers Polishing And Detailing Shop | active |
| `01M5W5PQH8PDMDMHX4F9XW9JGJ` | Zuboo Lanka (SDD Wings International (Pvt) Ltd) Kattankudi | Zuboo Lanka (SDD Wings International (PVT) Ltd) Kattankudi | active |
| `01M5W5PQH8SXHRASF5990MDV3R` | Swani Auto Land (Pvt) Ltd | Swani Auto Land (PVT) Ltd | active |
| `01M5W5PQH8X74VZV9CA5CNW35N` | Irsath car work shop | Irsath Car Work Shop | active |
| `01M5W5PQH9D2WTM63CDHPH80QQ` | Tyre work shop | Tyre Work Shop | active |
| `01M5W5PQH9HARPHDH4TTHMW4EK` | MH Japan parts | MH Japan Parts | active |
| `01M5W5PQHAZY0GN481PCTH8EA1` | Arul motors Aarayampathy | Arul Motors Aarayampathy | active |
| `01M5W5PQHBMQ0Q7YHK5MTJVEJZ` | VIP rent a car | VIP Rent A Car | active |
| `01M5W5PQHBPA8WSRT2TJ0MX5HG` | Subathra motors | Subathra Motors | active |
| `01M5W5PQHBRS2JB0QG5YXJBDVD` | Black Pearl Rides Auto hire Service | Black Pearl Rides Auto Hire Service | active |
| `01M5W5PQHBZ2GDYN0C0TGS20ZF` | Jahan tyre shop (mobile service) | Jahan Tyre Shop (Mobile Service) | active |
| `01M5W5PQHC2Q679XXATXNGHN81` | Muhsin cycle workshop | Muhsin Cycle Workshop | active |
| `01M5W5PQHC8BDHV0VFNV8XHN3T` | Multi cushion work shop | Multi Cushion Work Shop | active |
| `01M5W5PQHCD2DJY7PNMMEZS71N` | Muhsin cycle workshop | Muhsin Cycle Workshop | active |
| `01M5W5PQHCF1H1AXMST339FCPV` | VIP Lanka Hub Pvt Ltd | VIP Lanka Hub PVT Ltd | active |
| `01M5W5PQHCPX9GV7C7RKDS8NN8` | Kmmg (Pvt) Ltd | Kmmg (PVT) Ltd | active |
| `01M5W5PQHD5CYAMCZRVACNVYJ0` | sinopec filling Station S.Manikkarajah Arayampathy | Sinopec Filling Station S.Manikkarajah Arayampathy | active |
| `01M5W5PQHDA2XGPY8RY94GFSMZ` | R. A. Auto A/C and Electrical Workshop | R. A. Auto A/C And Electrical Workshop | active |
| `01M5W5PQHDAJG1K5T5J66T3N3X` | Suzuki every rent a car | Suzuki Every Rent A Car | active |
| `01M5W5PQHDP4WQADFD84RCS4WP` | People's Leasing & Finance Plc | People's Leasing & Finance PLC | active |
| `01M5W5PQHEB13FS3WDZA6MVT3Y` | New barakath service centre | New Barakath Service Centre | active |
| `01M5W5PQHEMM1TR2828A51JDZM` | Muharis cycle workshop | Muharis Cycle Workshop | active |
| `01M5W5PQHH6RHGV5W080DBHEYE` | Shapi kids&house | Shapi Kids&House | active |
| `01M5W5PQHK4TY722WEVM631JVP` | Kky bag palace | Kky Bag Palace | active |
| `01M5W5PQHKHTP4WYGG37B5WFGA` | Raazath bags | Raazath Bags | active |
| `01M5W5PQHMP3XZSKXGXJQ0SHSK` | Buy&Get kky | Buy&Get Kky | active |
| `01M5W5PQHNQ711VB96NXYR0TSE` | Zainab food factory | Zainab Food Factory | active |
| `01M5W5PQHPF4G9C3BCDVHHGK1B` | kN store | kN Store | active |
| `01M5W5PQHPJZXD5TF3MBW2BF5P` | Dream cakes by nusfasajath | Dream Cakes By Nusfasajath | active |
| `01M5W5PQHPKRCX03AJQZVNXV1E` | Lingam Bakery Ingredients (Pvt) Ltd | Lingam Bakery Ingredients (PVT) Ltd | active |
| `01M5W5PQHPS0BQV40KNN9VHHCJ` | Athas cakes kattankudy | Athas Cakes Kattankudy | active |
| `01M5W5PQHPV7VZ2DW49S1PWKXJ` | MR rahmath bekary | MR Rahmath Bekary | active |
| `01M5W5PQHPX6QZHQY0H7YK4NRW` | Golden bakery | Golden Bakery | active |
| `01M5W5PQHQ48R7V280MFM7W46K` | Princess baker | Princess Baker | active |
| `01M5W5PQHQ6JV592F4CN8TMRT2` | Reeza's -the art of cake | Reeza's -The Art Of Cake | active |
| `01M5W5PQHQJBKPHB3WHT0VRKYF` | Doha Restaurant and Bake House | Doha Restaurant And Bake House | active |
| `01M5W5PQHQKKBX4ECGV4XGC187` | NS sister cake gift shop , kallady, batticaloa . | NS Sister Cake Gift Shop , Kallady, Batticaloa . | active |
| `01M5W5PQHRT0TM8ERSFM29ERNT` | Happy baking | Happy Baking | active |
| `01M5W5PQHSRR269BP45JEQ0BDY` | Cute cake | Cute Cake | active |
| `01M5W5PQHTDTCSVECV97RH4TB4` | Richway sweet | Richway Sweet | active |
| `01M5W5PQHV7127FEH0XPJD8YF9` | Sahama wadilappam | Sahama Wadilappam | active |
| `01M5W5PQHV7GV6AJY6ZKWRDGV5` | Online cake batticaloa | Online Cake Batticaloa | active |
| `01M5W5PQHW1Y0A34VQ8ZQVMWE1` | Maimoon pvt Ltd | Maimoon PVT Ltd | active |
| `01M5W5PQHWAY2HC2NZ665DGWGZ` | Maruthi Bakery and Cool spot | Maruthi Bakery And Cool Spot | active |
| `01M5W5PQHXQSZBBRSAZW7FXZ3F` | Crème & crumb.s | Crème & Crumb.s | active |
| `01M5W5PQHY10XYMPV2836G34PG` | Mr Dot's fast food (New Open) | Mr Dot's Fast Food (New Open) | active |
| `01M5W5PQHYJ8QZTAEMJMP162EW` | Pearl of cakes | Pearl Of Cakes | active |
| `01M5W5PQHYVMSQQNBAN9A6NXCY` | Make my cakes | Make My Cakes | active |
| `01M5W5PQJ1JF3J3RXX1YJ27CZ8` | Home for short stay | Home For Short Stay | active |
| `01M5W5PQJ5R151MA5EMBDPCYR0` | Wells Ice Cream and Cafe | Wells Ice Cream And Cafe | active |
| `01M5W5PQJ647QKQ2MXVVNP9JET` | Eastern vibes cafe | Eastern Vibes Cafe | active |
| `01M5W5PQJ6NE1Y06AWMH9842Q1` | Sea Breeze cafe | Sea Breeze Cafe | active |
| `01M5W5PQJ7CHYQD059BKM31QM1` | Doha Restaurant and Bake House | Doha Restaurant And Bake House | active |
| `01M5W5PQJ868VAQR021PCHPN83` | assignment Cafe | Assignment Cafe | active |
| `01M5W5PQJ86PE6J76J5HP7BD2F` | Mhd fanoos | Mhd Fanoos | active |
| `01M5W5PQJ877GMK6RVPNK6CMMR` | Kawa chai hut | Kawa Chai Hut | active |
| `01M5W5PQJ8ECXBFYVG8ZYYBH70` | Rafaideen rotti shop | Rafaideen Rotti Shop | active |
| `01M5W5PQJ8GMP4G1TQE534XXXH` | Ice land kky | Ice Land Kky | active |
| `01M5W5PQJ986EMV4N3D03T8JEK` | Kerny lane | Kerny Lane | active |
| `01M5W5PQJAEA280S09HV38JP6Y` | Happy wings | Happy Wings | active |
| `01M5W5PQJAHFATEKFMRHD3HV7D` | Kulfi Ice kattankudy | Kulfi Ice Kattankudy | active |
| `01M5W5PQJC7AB35029KTAXNCDX` | Juice World Hot&cool | Juice World Hot&Cool | active |
| `01M5W5PQJCSG6DPG6K2RM2Z9JZ` | Poori shop | Poori Shop | active |
| `01M5W5PQJDFN65GBPZ5HT1KKT7` | Fareed Taste shop | Fareed Taste Shop | active |
| `01M5W5PQJEC4HGDR35J601BJM0` | Najirath hotel | Najirath Hotel | active |
| `01M5W5PQJFPH6SR95H9GAHXP2Y` | Arafa buriyany center | Arafa Buriyany Center | active |
| `01M5W5PQJH2PJ7QND3029ARN08` | Dr kitchen Family Restaurant | Dr Kitchen Family Restaurant | active |
| `01M5W5PQJHBQCH3ED0EY81TMRV` | Dr kitchen | Dr Kitchen | active |
| `01M5W5PQJJ87V100XXC5A64ZYM` | Taj hotel | Taj Hotel | active |
| `01M5W5PQJK3MXR1RE3PSX77JSM` | Sahana indian food | Sahana Indian Food | active |
| `01M5W5PQJKKZCS5A9GRXRT4KRA` | Green chilli | Green Chilli | active |
| `01M5W5PQJM6NMGTT1ASZNVPSGZ` | Cook and Best Catering Service | Cook And Best Catering Service | active |
| `01M5W5PQJMAV5HS93BJF5SGGNE` | Jinsath home | Jinsath Home | active |
| `01M5W5PQJMRHZBB1F3D4RMD68F` | Thangama home food | Thangama Home Food | active |
| `01M5W5PQJMV6QJSAX7Z9587X7Z` | Anver cool mess | Anver Cool Mess | active |
| `01M5W5PQJMWES0N022RY1R2KE9` | Hithayath cool | Hithayath Cool | active |
| `01M5W5PQJN7S1X2KZSD2RN38BX` | Delmo chicken & sausages dealer batticaloa | Delmo Chicken & Sausages Dealer Batticaloa | active |
| `01M5W5PQJN9W2VN5Y9QH4Z0RGZ` | Srilankan food batticaloa | Srilankan Food Batticaloa | active |
| `01M5W5PQJNFW5BDGRGZ4N5J3RS` | King kitchen | King Kitchen | active |
| `01M5W5PQJNS5958FRTW44ZJERF` | Happy land ice cream | Happy Land Ice Cream | active |
| `01M5W5PQJQ4SD7HB45JHVM28H1` | Ultra hospital | Ultra Hospital | active |
| `01M5W5PQJQJZWEF1QE026PJDRR` | Best care medical | Best Care Medical | active |
| `01M5W5PQJSHMC6SQWH8EBXTRV2` | Ayurvedic hospital (pancha karma) | Ayurvedic Hospital (Pancha Karma) | active |
| `01M5W5PQJVR6Z957DF3ZZFDZ37` | DOT NET (PVT) LTD. (TRAVELS / STUDIO / COMMUNICATION) | Dot Net (PVT) Ltd. (Travels / Studio / Communication) | active |
| `01M5W5PQJWK67NWSDC1XP09BVD` | COCO AGENCY | Coco Agency | active |
| `01M5W5PQJWP9BC1R5W4K2S4NCK` | Mobile expert | Mobile Expert | active |
| `01M5W5PQJWPEASBQDAY85CABX1` | LINK COMMUNICATION (AP. NAFEEL) | Link Communication (AP. Nafeel) | active |
| `01M5W5PQJYB0KAB7AMVZETDG51` | ADVANCED DIGITAL SECURITY (ADS CCTV) | Advanced Digital Security (ADS CCTV) | active |
| `01M5W5PQJZAD644ZKFR54ZFZQV` | MOULANA COLOMBO COSMETICS | Moulana Colombo Cosmetics | active |
| `01M5W5PQJZBW5KV2WZ2QYT0YNK` | 3G Mobile World kattankudy | 3G Mobile World Kattankudy | active |
| `01M5W5PQJZF7F624V3NA58V7Q0` | NHK HARDWARE & MARKETING | NHK Hardware & Marketing | active |
| `01M5W5PQJZX9E8JQVW5JRXHR1X` | KYANYA COMMUNICATION | Kyanya Communication | active |
| `01M5W5PQK1C1FYMN9SZMK5VS8W` | Dreams communication | Dreams Communication | active |
| `01M5W5PQK2GBJ52RKR2H2XD5K4` | PRINCE N PRINCESS | Prince N Princess | active |
| `01M5W5PQK305ZMEGBQ2C0NJK3X` | AL MANASIK TRAVELS (Pvt) Ltd | AL MANASIK TRAVELS (PVT) Ltd | active |
| `01M5W5PQK3GZ6MH1CG3EKJ7S10` | Shining communication | Shining Communication | active |
| `01M5W5PQK3NY3ZVVWFDK2PPWVW` | SPEEDCOPY COMMUNICATION | Speedcopy Communication | active |
| `01M5W5PQK4MWX38YBZ9EJ82EEZ` | HIKVISION DAHUA CCTV SHOWROOM ADS CCTV | Hikvision Dahua CCTV Showroom ADS CCTV | active |
| `01M5W5PQK4T5NHCVGSPEK9Y2B3` | Coastal Creatives Pvt Ltd | Coastal Creatives PVT Ltd | active |
| `01M5W5PQK5DWWEWM9ENKFTTE12` | AGMI TEX | Agmi Tex | active |
| `01M5W5PQK6QJKW0M2PHDMF8RHQ` | SMS GROUP OF MARKETING(PRIVATE)LIMITED | Sms Group Of Marketing(Private)Limited | active |
| `01M5W5PQK6RVKR0R746B6FT2NP` | Lushanth Pvt Ltd | Lushanth PVT Ltd | active |
| `01M5W5PQK7TAHV18TGNHZST4KB` | DJ THANA | DJ Thana | active |
| `01M5W5PQK7XZ6XN4T3VQTTSY07` | Kirusshi Cool Spot and Communication | Kirusshi Cool Spot And Communication | active |
| `01M5W5PQKAQWDV3W0GWWFES8FT` | Kavithai Communication and fancy | Kavithai Communication And Fancy | active |
| `01M5W5PQKBMKJGV5NH8XTRJ7K2` | M.C.M gas Sales Center (Litro Gas Point ) | M.C.M Gas Sales Center (Litro Gas Point ) | active |
| `01M5W5PQKCADQ1YCJTJBCVW3BZ` | Prapa communication | Prapa Communication | active |
| `01M5W5PQKCCHXEMN3AN886XF8M` | Balanze Media Batticaloa web Development IT Solution | Balanze Media Batticaloa Web Development IT Solution | active |
| `01M5W5PQKFE39QW16NPWD1VNT9` | Elakki communication | Elakki Communication | active |
| `01M5W5PQKFP86S9CHS5PJTS62M` | TechCodz Pvt Ltd | TechCodz PVT Ltd | active |
| `01M5W5PQKGDAQ39PVEMFYG647G` | AATHARAVU CARE TRUST (PVT) LTD | Aatharavu Care Trust (PVT) Ltd | active |
| `01M5W5PQKGTAWAT0SNV3WFFS3S` | uthayam communication | Uthayam Communication | active |
| `01M5W5PQKKH6D37F71BKEJ1M5Z` | Boom Computers and Phones | Boom Computers And Phones | active |
| `01M5W5PQKMGYWGNJG9FMH3KJSP` | Sri siranjeevi (Computers & Repairing) | Sri Siranjeevi (Computers & Repairing) | active |
| `01M5W5PQKMVPN0JSSYR5KR6VP9` | Aroos Moulavi Computer laptop and printer repair | Aroos Moulavi Computer Laptop And Printer Repair | active |
| `01M5W5PQKQN8RRCQXM2B0EH38T` | k-Soft IT Solutions | K-Soft IT Solutions | active |
| `01M5W5PQKS9JXQPQA0RRV1PXV5` | Pc Town Batticaloa | PC Town Batticaloa | active |
| `01M5W5PQM988Y3F0BYH03A6SR5` | Easteran it Solutions | Easteran IT Solutions | active |
| `01M5W5PQM98QKJ2F6HC0VPHFRF` | Asian mobile | Asian Mobile | active |
| `01M5W5PQMAAVX97V1KK360DW3W` | Hi-tech | Hi-Tech | active |
| `01M5W5PQMAPW9GPF8DT9B09S3T` | Mobile expert | Mobile Expert | active |
| `01M5W5PQMBA63HE3GWAQG3TM8J` | Naseela Tiles (Pvt) Ltd | Naseela Tiles (PVT) Ltd | active |
| `01M5W5PQMCHPV2ZJ32ZCYE72S4` | M-Tech It & Network Solution | M-Tech IT & Network Solution | active |
| `01M5W5PQMEN9FGHSEY6E0V16CS` | Barakath fancy | Barakath Fancy | active |
| `01M5W5PQMGB8HJ4NBFXTGSSRSN` | Shaz beauty salon and Academy | Shaz Beauty Salon And Academy | active |
| `01M5W5PQMJG80DZFNE4YH9PPC2` | Fisheries rd | Fisheries Rd | active |
| `01M5W5PQMK4QPH1WADP6JSEYV5` | FaRima's Glow And Growth pvt (Ltd) | FaRima's Glow And Growth PVT (Ltd) | active |
| `01M5W5PQMKCCNZPBGTE584R0P7` | Kader masthan massage center | Kader Masthan Massage Center | active |
| `01M5W5PQMKJP0G82ZMKHPHEG60` | Black beauty plus | Black Beauty Plus | active |
| `01M5W5PQMMW5198108TBHGZF3D` | Panci basaer | Panci Basaer | active |
| `01M5W5PQMMY6Q2TFRM4G2EZAYK` | Harnee beauty care & cosmetics | Harnee Beauty Care & Cosmetics | active |
| `01M5W5PQMN31SH83JPYHY4NK5T` | Speed Eats Delivery Service office | Speed Eats Delivery Service Office | active |
| `01M5W5PQMQ3J08BQ5TY7AS8MQ7` | TLK Food city | TLK Food City | active |
| `01M5W5PQMRFCHH2DPSPKPTECP2` | ABS Courier Pvt ltd | ABS Courier PVT Ltd | active |
| `01M5W5PQMS56XGZP4CBRYC0W65` | Mr.Gold Food Marketing (Pvt) Ltd Sri Lanka | Mr.Gold Food Marketing (PVT) Ltd Sri Lanka | active |
| `01M5W5PQMT5GK53J7XZ7N7A3TH` | Certis Lanka courier service | Certis Lanka Courier Service | active |
| `01M5W5PQMTN97KK67MG029TN20` | Asian mobile | Asian Mobile | active |
| `01M5W5PQMWXKFBTZFJSF73YPZG` | Maxpro online store | Maxpro Online Store | active |
| `01M5W5PQMY3Y5ZTMKDJ1KNGGZD` | Teaching and Learning College | Teaching And Learning College | active |
| `01M5W5PQMZ0EXX4WJRWQK6PKGH` | Al hudha college | Al Hudha College | active |
| `01M5W5PQMZGKHBGBEF84JAKH4W` | Learning tree Primary and Secondary Division | Learning Tree Primary And Secondary Division | active |
| `01M5W5PQN1RW5B2HKGBMWF15F3` | Monash English academy | Monash English Academy | active |
| `01M5W5PQN235ZHXP05FNYX3WA1` | Professional Development center for Teachers | Professional Development Center For Teachers | active |
| `01M5W5PQN26HMCR0YGSES3PQDT` | Sha academy | Sha Academy | active |
| `01M5W5PQN4KQZ8S56MMKYFKQQV` | School for Pioneers | School For Pioneers | active |
| `01M5W5PQN4NKE2FZFAA616EERF` | assignment Cafe | Assignment Cafe | active |
| `01M5W5PQN5RC41S97PWWRG99KR` | Center for islamic guidance | Center For Islamic Guidance | active |
| `01M5W5PQN69B1YTFE6F96EMJHF` | Millennium Institute of Speech | Millennium Institute Of Speech | active |
| `01M5W5PQNA4652YDYDFVMCPJJD` | Thalankudah College of Education | Thalankudah College Of Education | active |
| `01M5W5PQNAG99XPJB20HKPYTC0` | DAS School for Kids | DAS School For Kids | active |
| `01M5W5PQNAPD6SWPT02K0M8K5D` | CIG's College for Islam, Science and IT | CIG's College For Islam, Science And IT | active |
| `01M5W5PQNB07QPT348HQ7C1BWG` | Thajweedul Quran and Arabic College | Thajweedul Quran And Arabic College | active |
| `01M5W5PQNBQB1KZNY4YF3GTG3Y` | PEACE Centre for Education | PEACE Centre For Education | active |
| `01M5W5PQND3NBE6DBSCXPD7CB6` | Mukarram's house | Mukarram's House | active |
| `01M5W5PQNDFKM926PE769X4TSN` | Inspirations Education and Visa Services | Inspirations Education And Visa Services | active |
| `01M5W5PQNDMRWB7PKQWPG39QQ7` | Public library kattankudy | Public Library Kattankudy | active |
| `01M5W5PQNGT60JAA4X1D11VG84` | Dr Alavi Sheriffdeen School for Pioneers | Dr Alavi Sheriffdeen School For Pioneers | active |
| `01M5W5PQNHS4FXE72NM1WV3RPH` | Ilanthalir's college for Mathematics and Science | Ilanthalir's College For Mathematics And Science | active |
| `01M5W5PQNHY2ZAJYEXR2GXM0DZ` | Markaz,Arabic College and Mosque | Markaz,Arabic College And Mosque | active |
| `01M5W5PQNJ971H49R5S02ZTAM2` | Hizbullah cultural hall | Hizbullah Cultural Hall | active |
| `01M5W5PQNME93ENSJTMGBK43WE` | Bt/Arayampathy Subramaniam Vidyalayam | BT/Arayampathy Subramaniam Vidyalayam | active |
| `01M5W5PQNRH34KN6ZYPNHABVJE` | Henna by Hana Kattankudy | Henna By Hana Kattankudy | active |
| `01M5W5PQNRK268M4T5HYC056H8` | NR mehandhi | NR Mehandhi | active |
| `01M5W5PQNS7FJ3CJV8FKF37QK7` | Cheap multi shop | Cheap Multi Shop | active |
| `01M5W5PQNSKW9H1SPAXXR2CKSJ` | School for Pioneers - Hope campus | School For Pioneers - Hope Campus | active |
| `01M5W5PQNT41S200FX1W661TKJ` | Book shop | Book Shop | active |
| `01M5W5PQNTQ4D6VZESM726J3TB` | Arayampathy RKM girls school | Arayampathy RKM Girls School | active |
| `01M5W5PQNV1GQEYTGQS75G004D` | Genius chess academy | Genius Chess Academy | active |
| `01M5W5PQP4K3YC6R5JVW7YY4PT` | Reaping shop | Reaping Shop | active |
| `01M5W5PQP4MSDY0PF3JZCNNSA7` | AZA Home Security Solutions (Pvt) Ltd | AZA Home Security Solutions (PVT) Ltd | active |
| `01M5W5PQP706D1Z6VN3067N9C4` | Asian mobile | Asian Mobile | active |
| `01M5W5PQP7G6XJ9XGRTY84N56M` | Riyas Multi corner | Riyas Multi Corner | active |
| `01M5W5PQP803A8ZZFNKTGWQWDD` | Machine center kattankudy | Machine Center Kattankudy | active |
| `01M5W5PQP80H6XX57A4QKSE0SD` | Naseela Tiles (Pvt) Ltd | Naseela Tiles (PVT) Ltd | active |
| `01M5W5PQP8DQ24SJRKW0T5SY44` | I&I brothers | I&I Brothers | active |
| `01M5W5PQP8NMPHNK8XM6ETW51M` | IT care Kattankudy | IT Care Kattankudy | active |
| `01M5W5PQPB0HQQ92ZVXC290CW7` | Boom Computers and Phones | Boom Computers And Phones | active |
| `01M5W5PQPF2JEXKJM09H0K3C4A` | Sajenthiran home | Sajenthiran Home | active |
| `01M5W5PQPFTR901FHM4WRJRYR6` | Nawas foreign shop | Nawas Foreign Shop | active |
| `01M5W5PQPG3X6NN6ES3C97PEQN` | Mobile expert | Mobile Expert | active |
| `01M5W5PQPGK12QNVPFH0E1A99W` | Hikvision Dahua CCTV Showroom Ads CCTV | Hikvision Dahua CCTV Showroom ADS CCTV | active |
| `01M5W5PQPHT6QE8JY5R6104F46` | Dot Net (Pvt) Ltd. (Travels / Studio / Communication) | Dot Net (PVT) Ltd. (Travels / Studio / Communication) | active |
| `01M5W5PQPP4HGEJ7JPT0YVCWM2` | King of Electronics | King Of Electronics | active |
| `01M5W5PQPPA0QQ7NB07RGWPQ1S` | Jiffry furniture centre | Jiffry Furniture Centre | active |
| `01M5W5PQPPYTG8TBT1C2RKN8ZQ` | Winning star Repairing center | Winning Star Repairing Center | active |
| `01M5W5PQPS3DNWYZBR1EK66Z3A` | eeTel: Eastern Electronic & Telecommunication (Pvt) Ltd | eeTel: Eastern Electronic & Telecommunication (PVT) Ltd | active |
| `01M5W5PQPW173AN8C0MS6N2E9R` | Saja aluminium | Saja Aluminium | active |
| `01M5W5PQPXFXBHSCFMHTVHK8Z0` | Pc Town Batticaloa | PC Town Batticaloa | active |
| `01M5W5PQPXZPZ49W2WJTY8QG6R` | Moulana mosq | Moulana Mosq | active |
| `01M5W5PQQ7WJ9GXC69QSXQ480G` | Accident and Emergency Treatment Unit | Accident And Emergency Treatment Unit | active |
| `01M5W5PQQ9AGR5HX79PNRNF18F` | SPC Hospital & kidney care | SPC Hospital & Kidney Care | active |
| `01M5W5PQQA5HZ5YQBNAHN91A1H` | Genitourinary unit | Genitourinary Unit | active |
| `01M5W5PQQAWDEMGWJWGA5D80EZ` | Cardiology Unit-teaching hospital-batticaloa | Cardiology Unit-Teaching Hospital-Batticaloa | active |
| `01M5W5PQQEJ19GT0SYM5S4NE3W` | Mr fancy | Mr Fancy | active |
| `01M5W5PQQEK3JX2ZRBKQ0HZZE5` | House of fancy | House Of Fancy | active |
| `01M5W5PQQP01GSC9HMF3FJPSQ5` | Vesloo Wholesale centre | Vesloo Wholesale Centre | active |
| `01M5W5PQQP2VA1WPHADP8D9GK6` | Aj fashion | Aj Fashion | active |
| `01M5W5PQQPM89CCZKTR8R61VRW` | Top gallery | Top Gallery | active |
| `01M5W5PQQQKH9MQBBGF31MNZER` | Elegant Fashion kattankudy | Elegant Fashion Kattankudy | active |
| `01M5W5PQQRK97WQBXV3Q1E4WJK` | Hani fashion | Hani Fashion | active |
| `01M5W5PQQTGVWMVZ7Y8FE9VNDK` | Abaya Fashion kky | Abaya Fashion Kky | active |
| `01M5W5PQQWPHMWYVG8WJBZ8SMG` | Dubai fashion | Dubai Fashion | active |
| `01M5W5PQQYSK236CVCB08CKADH` | ADDAX Clothing (Pvt) Ltd. | ADDAX Clothing (PVT) Ltd. | active |
| `01M5W5PQQZF35C7ZJ9ZD4B9VV7` | Mufaris Textiles kattankudy (MTK) | Mufaris Textiles Kattankudy (MTK) | active |
| `01M5W5PQQZX4KF07R8FVK2P7Q3` | Cheap multi shop | Cheap Multi Shop | active |
| `01M5W5PQR39F9FHK931KSWB2Q0` | SUNRO BATIK centre | SUNRO BATIK Centre | active |
| `01M5W5PQR5KYNHGAZ9WN3YVBFT` | My garments | My Garments | active |
| `01M5W5PQR5TY4FA5R1CSHXNG6Q` | Click the mall | Click The Mall | active |
| `01M5W5PQR6BHTXWCZ32ZYG5GHN` | Shalwar srilanka | Shalwar Srilanka | active |
| `01M5W5PQR80AD4QE1CDF4NK3AZ` | Saree - Symbol of Beauty | Saree - Symbol Of Beauty | active |
| `01M5W5PQR9MG7J8K3VK10CSYF5` | HANIFFA'S Authorized Distributor Moose Clothing company | HANIFFA'S Authorized Distributor Moose Clothing Company | active |
| `01M5W5PQR9STT82W959C4FDWWW` | Musny Fation kattankudy | Musny Fation Kattankudy | active |
| `01M5W5PQRA8Y802XDNEGRD68PE` | Mk Fashion | MK Fashion | active |
| `01M5W5PQRACWASTXEBZABB3DXC` | Aleeza bridal | Aleeza Bridal | active |
| `01M5W5PQRBQ5FD5DEYFC48XV6V` | Blue line garment | Blue Line Garment | active |
| `01M5W5PQRCDFHRJ7JHB2TQT49J` | Sharaf bin Thaj | Sharaf Bin Thaj | active |
| `01M5W5PQRGYFWF74T4B7JNKAVC` | New thaj Plaza | New Thaj Plaza | active |
| `01M5W5PQRHFDAK7YBQ9H1GJ0Z0` | Mutton shop | Mutton Shop | active |
| `01M5W5PQRMQDS28V3YNT6J98F5` | Day with Collections | Day With Collections | active |
| `01M5W5PQRR8M4Y1BBE2WJ813AB` | East Lanka Trading Company (Pvt) Ltd | East Lanka Trading Company (PVT) Ltd | active |
| `01M5W5PQRVDW9AK4PJTJK3NNXV` | Mercantile Investments and Finance PLC - Batticaloa | Mercantile Investments And Finance PLC - Batticaloa | active |
| `01M5W5PQRW08KJ6041WFF54V75` | Nation Lanka Finance Plc | Nation Lanka Finance PLC | active |
| `01M5W5PQRW8MT8ZRJCJBZWB2EX` | Sabri Audit office | Sabri Audit Office | active |
| `01M5W5PQS4VFZMEPKXNQNP58KY` | Sanfu Footwear Industries (pvt) Ltd. | Sanfu Footwear Industries (PVT) Ltd. | active |
| `01M5W5PQS5EMD82HE96H8JA901` | HI STEPS footwear | HI STEPS Footwear | active |
| `01M5W5PQSAEP5RKXV8PFZZD6KT` | PLanka filling station (Pvt) Ltd. Thalankudah | PLanka Filling Station (PVT) Ltd. Thalankudah | active |
| `01M5W5PQSB75900QQR2FH5N2QG` | Jegathees and Sons - CEYPETCO Filling Station | Jegathees And Sons - CEYPETCO Filling Station | active |
| `01M5W5PQSDE582R9BTNXGV4QW0` | P.T. Arasan and Son PVT LTD. Ceypetco Filling Station | P.T. Arasan And Son PVT LTD. Ceypetco Filling Station | active |
| `01M5W5PQSFJJAP2WV8AEB9E919` | Fs furniture | Fs Furniture | active |
| `01M5W5PQSFQEJA1P595F489YDE` | Sofa max kattankudy | Sofa Max Kattankudy | active |
| `01M5W5PQSFY3MY63BEQ1M9H1JF` | Rio Timber and Furniture | Rio Timber And Furniture | active |
| `01M5W5PQSHZG05WMT3DF0PEK2E` | Nazeela Hard Ware (Pvt) Ltd | Nazeela Hard Ware (PVT) Ltd | active |
| `01M5W5PQSJNK9PCKH6NWNEQYY6` | Everest growmore enterprises | Everest Growmore Enterprises | active |
| `01M5W5PQSJVBG9XTJAKEHQ1EGN` | arpico Warehouse | Arpico Warehouse | active |
| `01M5W5PQSMP5MKKJG1NP4T6BCX` | National water supply and drainage board | National Water Supply And Drainage Board | active |
| `01M5W5PQSNMB0TD0B1H206GD26` | Tafcon International Pvt Ltd | Tafcon International PVT Ltd | active |
| `01M5W5PQSNX1P6QGHTY6VXG740` | Public library kattankudy | Public Library Kattankudy | active |
| `01M5W5PQSNY6RP115PZ6H3SE53` | Sub MOH office | Sub MOH Office | active |
| `01M5W5PQSPF6X56W147XAK4Y4A` | Department of National community water supply Batticaloa | Department Of National Community Water Supply Batticaloa | active |
| `01M5W5PQSRW1AJQ8WWEX3R0RG5` | Royal Grand banquet hall | Royal Grand Banquet Hall | active |
| `01M5W5PQSSKD70XQ9KY6W5GZDB` | Jumeirah banquet Hall | Jumeirah Banquet Hall | active |
| `01M5W5PQSTVR4TB2X61AWW16N1` | Salaka Palace Kattankudy wedding hall | Salaka Palace Kattankudy Wedding Hall | active |
| `01M5W5PQSVAW67RSCDAYV29PJ1` | Mina Wedding and Waleema Hall | Mina Wedding And Waleema Hall | active |
| `01M5W5PQSVHARWC6CMBYZQMA2A` | Hizbullah cultural hall | Hizbullah Cultural Hall | active |
| `01M5W5PQSW6G515WG5X494F750` | WELCOME VILLA (Rooms, Wedding and Waleema Hall) | WELCOME VILLA (Rooms, Wedding And Waleema Hall) | active |
| `01M5W5PQSX64FJ6CCKWX7EFTQ5` | Aalif home | Aalif Home | active |
| `01M5W5PQSZP3HZGSDHT6HJE537` | Naseela Tiles (Pvt) Ltd | Naseela Tiles (PVT) Ltd | active |
| `01M5W5PQSZZTDBAH9FTCWQ3X6F` | K.L.M. Hardware and Construction | K.L.M. Hardware And Construction | active |
| `01M5W5PQT0WD9B64GWHH739JW3` | Nhk Hardware & Marketing | NHK Hardware & Marketing | active |
| `01M5W5PQT1V79RRVSVJ5PTTJ9S` | Madheeha Enterprices (store) | Madheeha Enterprices (Store) | active |
| `01M5W5PQT2159Q6GZCKV5ADXCG` | Haji SHM.Ismail and Son | Haji SHM.Ismail And Son | active |
| `01M5W5PQT5Q3W1NDPA8Z3AGQ85` | Mullai hardware (Kokkadisolai) | Mullai Hardware (Kokkadisolai) | active |
| `01M5W5PQT73ZT0R1P637JZJRXS` | Home needs food centre | Home Needs Food Centre | active |
| `01M5W5PQT7QW69HVY6TDFA2B7D` | Dream Home Deco (Pvt) Ltd | Dream Home Deco (PVT) Ltd | active |
| `01M5W5PQTBG6D6KXHM2PC2N1HC` | Naseela Tiles (Pvt) Ltd | Naseela Tiles (PVT) Ltd | active |
| `01M5W5PQV06D57YMMGHQJQEJFB` | Ribbon hand craft | Ribbon Hand Craft | active |
| `01M5W5PQVR1DQ5RFJP9WAS3N9M` | MPGG+5J2 market | MPGG+5J2 Market | active |
| `01M5W5PQVR3AFRSXM92MA86YBX` | Micc mall | Micc Mall | active |
| `01M5W5PQVR4K97Q2YYXZ0Y8YM0` | Makbool vegetables & fruits shop | Makbool Vegetables & Fruits Shop | active |
| `01M5W5PQVS00KKCJKTSS6K4A23` | ANF products | ANF Products | active |
| `01M5W5PQW12DDF1AHPKTPPCR2E` | FRS market | FRS Market | active |
| `01M5W5PQW1V40AFKZGAVQ1B54X` | Masha Allah vegetable shop KKY | Masha Allah Vegetable Shop KKY | active |
| `01M5W5PQW21MC9A1A91FD4AY9E` | Rifthi Online market | Rifthi Online Market | active |
| `01M5W5PQW2GE1KX7V50GNQRWCT` | Henza marketing | Henza Marketing | active |
| `01M5W5PQW35GA8PGFTRFD0224T` | arayampathy Public market | Arayampathy Public Market | active |
| `01M5W5PQW8EYZ83TPCD0EY71HG` | Mobile world | Mobile World | active |
| `01M5W5PQW90GNJPDJAYY6GABAQ` | Asian mobile | Asian Mobile | active |
| `01M5W5PQWA5MBT7XSV8ATED00S` | Mobile expert | Mobile Expert | active |
| `01M5W5PQWAYCCD7H058QDMKQ5C` | NR Printing and Mobile | NR Printing And Mobile | active |
| `01M5W5PQWC41R3YGNAR2DQ00Z0` | Mobile xpress | Mobile Xpress | active |
| `01M5W5PQWCQ9H39NJKPQ0HRFR1` | 3G MOBILE technology | 3G MOBILE Technology | active |
| `01M5W5PQWG9FQXP6SVS49FF6A6` | Boss mobile | Boss Mobile | active |
| `01M5W5PQWHGAWEY4F4KX44MSZJ` | Apple Fix Expert Pvt (Ltd) | Apple Fix Expert PVT (Ltd) | active |
| `01M5W5PQWJRBRG8YJT8DZ5MM4V` | M.m.m.fuwad arshath | M.m.m.fuwad Arshath | active |
| `01M5W5PQWKAK0G2FK0HJ9MK7XJ` | Golden Tech Pvt Ltd | Golden Tech PVT Ltd | active |
| `01M5W5PQWN505AJG7EB353E6MS` | Boom Computers and Phones | Boom Computers And Phones | active |
| `01M5W5PQWP43CRJYWD4HBVBKPN` | Dot Net (Pvt) Ltd. (Travels / Studio / Communication) | Dot Net (PVT) Ltd. (Travels / Studio / Communication) | active |
| `01M5W5PQWQ61FZ8P42BS5K9KAN` | Mobile Genius batticaloa | Mobile Genius Batticaloa | active |
| `01M5W5PQWQED77NKH76AG0207E` | Nikith smart cell | Nikith Smart Cell | active |
| `01M5W5PQWRQNGBSYACZE2EVAD8` | Mobile tech | Mobile Tech | active |
| `01M5W5PQWT0GHRKKE4S4WP0DHG` | Markaz,Arabic College and Mosque | Markaz,Arabic College And Mosque | active |
| `01M5W5PQWTBWMVZ4QSHYWJ84M9` | Islamic Centre of Kattankudy | Islamic Centre Of Kattankudy | active |
| `01M5W5PQWTV247ZMV7AEY5GK8X` | Masjid Al-Rahmah kattankudy | Masjid Al-Rahmah Kattankudy | active |
| `01M5W5PQWWWZK14NZ747KXRPVN` | Masjid Ayishathu bin Aboobacker | Masjid Ayishathu Bin Aboobacker | active |
| `01M5W5PQWX8SBATFF5HAS2PZJ4` | Masjid ul Maryam | Masjid Ul Maryam | active |
| `01M5W5PQWZGZZHDK0MRD93A2CD` | Masjid Asmaa bint Abu Bakr | Masjid Asmaa Bint Abu Bakr | active |
| `01M5W5PQWZKQ4GRF08G6E9N0QS` | Masjidul Manfaul Hairath & Madrasa kattankudy | Masjidul Manfaul Hairath & Madrasa Kattankudy | active |
| `01M5W5PQX5GP6JESW5NJECTBDQ` | Salamath mosque | Salamath Mosque | active |
| `01M5W5PQX5TM42SDSV2JBX6JWA` | Fathima islamic college | Fathima Islamic College | active |
| `01M5W5PQX606Y2R9CDPWA9ZVVE` | Eman masjith | Eman Masjith | active |
| `01M5W5PQX6KC5M2JGGNP1Q73G3` | Fazal's home | Fazal's Home | active |
| `01M5W5PQX85R16J5RFMNFRCMMC` | Federation of Kathankudy Mosques and Muslim Institutions | Federation Of Kathankudy Mosques And Muslim Institutions | active |
| `01M5W5PQX90SQW762MVWZR1SGB` | Hidhaya college & hamid labbai alim hadees hall | Hidhaya College & Hamid Labbai Alim Hadees Hall | active |
| `01M5W5PQXBN5H6YCG3MEA1FHGZ` | Mujeeb optometrists | Mujeeb Optometrists | active |
| `01M5W5PQXCRXJ876B5Q7AC2Y2K` | Umar pet's mart | Umar Pet's Mart | active |
| `01M5W5PQXD5VRVPX7DXYVB2V41` | Royal pet mart batticaloa | Royal Pet Mart Batticaloa | active |
| `01M5W5PQXD6H0J8RB8XJVFD6X1` | Government Veterinary Surgeon 's Office | Government Veterinary Surgeon 'S Office | active |
| `01M5W5PQXDDQVT38MPY59GZ999` | The pet world | The Pet World | active |
| `01M5W5PQXEW433016M70800M55` | PSK Fish farm | PSK Fish Farm | active |
| `01M5W5PQXGX1V47WP2WA4HR5T2` | Medicare Pharmacy (Pvt) Ltd. | Medicare Pharmacy (PVT) Ltd. | active |
| `01M5W5PQXJ1CCNWQF58W8554XM` | New life Pharmacy | New Life Pharmacy | active |
| `01M5W5PQXJFYA0MW8KDBH9JHED` | Jasmin Ayurvedic Medicine shop | Jasmin Ayurvedic Medicine Shop | active |
| `01M5W5PQXNYBJKTA6WTSR0VHVE` | Rafaideen rotti shop | Rafaideen Rotti Shop | active |
| `01M5W5PQXNZ323T2Y8C5AR8Z9C` | Doha Restaurant and Bake House | Doha Restaurant And Bake House | active |
| `01M5W5PQXR48DEJHZA6VHKSDQR` | Eastern vibes cafe | Eastern Vibes Cafe | active |
| `01M5W5PQXT570ZTM1AKX0GKPCR` | Dr kitchen Family Restaurant | Dr Kitchen Family Restaurant | active |
| `01M5W5PQXTF0A63JF0KB0EZYFS` | Beach side hotel | Beach Side Hotel | active |
| `01M5W5PQXTYPZ3GZ9Q25QZ8A5J` | Happy wings | Happy Wings | active |
| `01M5W5PQXV08JQ4FA6QYEH3Y8F` | Taj hotel | Taj Hotel | active |
| `01M5W5PQXVRXKV3JPFKYWN6CE4` | Arafa buriyany center | Arafa Buriyany Center | active |
| `01M5W5PQXVV4F085K6E2GP51SX` | Dr kitchen | Dr Kitchen | active |
| `01M5W5PQXWB3HMBPR5BMR23949` | Anver cool mess | Anver Cool Mess | active |
| `01M5W5PQXXZ9S5J8SPPVAW7FMY` | Najirath hotel | Najirath Hotel | active |
| `01M5W5PQXYE7HJ3XW25YQDJV0R` | Sahana indian food | Sahana Indian Food | active |
| `01M5W5PQXZYADTZ1DMCKHX85F8` | Fareed Taste shop | Fareed Taste Shop | active |
| `01M5W5PQY0SAW2QV4J84CGW9D2` | Leena home made | Leena Home Made | active |
| `01M5W5PQY19TYHSEGKEXQATWYZ` | Green chilli | Green Chilli | active |
| `01M5W5PQY1G3FH2KPSAB9PCRGZ` | Poori shop | Poori Shop | active |
| `01M5W5PQY1W6716FZWVTXDS6F3` | Kawa chai hut | Kawa Chai Hut | active |
| `01M5W5PQY24KX7SJ7CD9NKFX0X` | Aahaa restaurant | Aahaa Restaurant | active |
| `01M5W5PQY3635CA33AR432AJ4D` | Jinsath home | Jinsath Home | active |
| `01M5W5PQY4CYJMVMVQ3KJVYDAV` | Thangama home food | Thangama Home Food | active |
| `01M5W5PQY543YV5EKA4XF5TPPT` | Kuthoos briyani | Kuthoos Briyani | active |
| `01M5W5PQY59BBYDD581EKJ3FV3` | Palamunai samoosa | Palamunai Samoosa | active |
| `01M5W5PQY6NF786Y0JGC98ECM0` | King kitchen | King Kitchen | active |
| `01M5W5PQY6WTRWNGWEX6NCMS11` | Rusthi hotel | Rusthi Hotel | active |
| `01M5W5PQY78YZVXNV0Y0B9PDD7` | Cook and Best Catering Service | Cook And Best Catering Service | active |
| `01M5W5PQY7BZYYKA3PXYEMXEAJ` | Sri Kishna cafe | Sri Kishna Cafe | active |
| `01M5W5PQY80MABVSP3YY8EN5KT` | Gama Gama Indian and Chinese Cuisine | Gama Gama Indian And Chinese Cuisine | active |
| `01M5W5PQY8NTBXS94TKKFV5HHM` | Hotel ahnaf(parotto) | Hotel Ahnaf(Parotto) | active |
| `01M5W5PQYAJGS3J6VYJW826Q38` | China town | China Town | active |
| `01M5W5PQYBHGE4AB6TMFDMFDPB` | Nachchiyar traditional food court | Nachchiyar Traditional Food Court | active |
| `01M5W5PQYBQWGQRK9AMNP9MGG1` | Abdullah taste | Abdullah Taste | active |
| `01M5W5PQYJ7Y7SHVRX2G7MFSPS` | Public library kattankudy | Public Library Kattankudy | active |
| `01M5W5PQYR0RB0PVC53RXEC01Q` | Rent a minivan | Rent A Minivan | active |
| `01M5W5PQYTZNYG1PT7VS1GJH9B` | Batticaloa Ads (PVT) LTD | Batticaloa ADS (PVT) LTD | active |
| `01M5W5PQYW5MCZAN4YBCGZ5FW7` | Classic lighting | Classic Lighting | active |
| `01M5W5PQYWGHCJKKZ556WTCVV4` | Kattankudy signal | Kattankudy Signal | active |
| `01M5W5PQYYS19TM3MVSQ4H2SKC` | Aathil sana | Aathil Sana | active |
| `01M5W5PQZ20047VDKSFAWHZ8NH` | Sanoordeen place | Sanoordeen Place | active |
| `01M5W5PQZ4DQFM55XHKDPHMB4T` | Riyas home | Riyas Home | active |
| `01M5W5PQZ7E7PWBQ6E6R5HBJ1D` | Riyas's home | Riyas's Home | active |
| `01M5W5PQZEV6HSX4H4ZA10KF0S` | New Beach Children park | New Beach Children Park | active |
| `01M5W5PQZFD5EW4PMMKVTNRZEC` | Hillurians sports park | Hillurians Sports Park | active |
| `01M5W5PQZFPPSKZEAMP3BQN2YS` | Nadhiya beach kattankudy | Nadhiya Beach Kattankudy | active |
| `01M5W5PQZGC495CHYERC8R62RS` | Saunders play ground | Saunders Play Ground | active |
| `01M5W5PQZHSY5E6V5Z75301MJS` | Boat safari | Boat Safari | active |
| `01M5W5PQZJR5KA7CD47HEQTB6C` | Hizbullah stadium | Hizbullah Stadium | active |
| `01M5W5PQZJWEZHBJSNJFC3Y7QK` | Pockets and Pawns | Pockets And Pawns | active |
| `01M5W5PQZR6YM5KZVCX7VE42C1` | AH private limited | AH Private Limited | active |
| `01M5W5PQZSV20GNFSFYENVAJES` | Kky cool spot@Bites | Kky Cool Spot@Bites | active |
| `01M5W5PQZWK4JCDWQ6CJ4FG4KP` | ALM fish Hut (Jawfar Hajiyar Vaadi) | ALM Fish Hut (Jawfar Hajiyar Vaadi) | active |
| `01M5W5PQZWWC1K56H9V33CRAQZ` | Chicken master | Chicken Master | active |
| `01M5W5PQZXS9NA2QGYKJ6PRXBR` | Online world | Online World | active |
| `01M5W5PQZYXDY7HAH2GYADJV0D` | Remico garden | Remico Garden | active |
| `01M5W5PR0021NPJND9ASNTGGMP` | Dot Net (Pvt) Ltd. (Travels / Studio / Communication) | Dot Net (PVT) Ltd. (Travels / Studio / Communication) | active |
| `01M5W5PR00Y9QM1D7G08RPA1ZW` | Air Ticketing and Visa Consultant | Air Ticketing And Visa Consultant | active |
| `01M5W5PR0371HXXWV4VVM68XYF` | Kathiroli Sports club ground | Kathiroli Sports Club Ground | active |
| `01M5W5PR03M7YMDS1M6SDDS3DQ` | Boat bank | Boat Bank | active |
| `01M5W5PR05M6E1SV5WC8TRNHJS` | Miss bridal | Miss Bridal | active |
| `01M5W5PR061VBER14WK3KSQ0CZ` | Cheap multi shop | Cheap Multi Shop | active |
| `01M5W5PR06DS8HKSWZXKQG5NA5` | Global visa Pvt ltd | Global Visa PVT Ltd | active |
| `01M5W5PR0749JBYC11VZYHXP8Q` | Natural History & Science Museum of Srilanka | Natural History & Science Museum Of Srilanka | active |
| `01M5W5PR09RRMNK2BY018JYVJ1` | MIA Beach Resort and Restaurant | MIA Beach Resort And Restaurant | active |
| `01M5W5PR09XC5RQAAQ3BX61R6F` | Salon Aynah Bridal Pvt (Ltd) | Salon Aynah Bridal PVT (Ltd) | active |
| `01M5W5PR0C6FVK70PVX1ZWJ74R` | East N' West on Board | East N' West On Board | active |
| `01M5W5PR0CP1EX7MV0E012SHRE` | Gulf Asian Travels (pvt) Ltd | Gulf Asian Travels (PVT) Ltd | active |
| `01M5W5PR0DCVJQ64G0B7D7SXGQ` | Al Banaath facial | Al Banaath Facial | active |
| `01M5W5PR0DWTJMAD6AVHVN1RBQ` | The Traveller And Leisure Insider (Pvt) Ltd | The Traveller And Leisure Insider (PVT) Ltd | active |
| `01M5W5PR0FWQZBV3P35EXE7QHY` | Thevanaayagampillai's garden-Arayampathy | Thevanaayagampillai's Garden-Arayampathy | active |
| `01M5W5PR0G79R55FYC66291RP5` | Shazaa bridal | Shazaa Bridal | active |
| `01M5W5PR0H2P8S2SFP65F1QAVJ` | Shadow park | Shadow Park | active |
| `01M5W5PR0HRWKSR2S6J4P2YHXT` | Natheer's garden | Natheer's Garden | active |
| `01M5W5PR0JH5T38M0JMGXBJ4WG` | Link Communication (Ap. Nafeel) | Link Communication (AP. Nafeel) | active |
| `01M5W5PR0M6D1NJHD6T1YZHYEQ` | Arayampathy rental | Arayampathy Rental | active |
| `01M5W5PR0M8RTGCFR2TJDTF306` | Nakheel Al Jazeera (Pvt) Ltd | Nakheel Al Jazeera (PVT) Ltd | active |
| `01M5W5PR0QD51JE5CRXM32QGFX` | Our Lady of Lourdes Church | Our Lady Of Lourdes Church | active |
| `01M5W5PR0T5HDV4DWW5B53MDBG` | Markaz,Arabic College and Mosque | Markaz,Arabic College And Mosque | active |
| `01M5W5PR0XGKKHSKWXMKF108NK` | Saint little lourdes church | Saint Little Lourdes Church | active |
| `01M5W5PR0Y6M0X3ZBDHRTZFTC6` | St. Theresa of Infant Jesus Church Arayampathy | St. Theresa Of Infant Jesus Church Arayampathy | active |
| `01M5W5PR162BKKZXC5K0EC93V4` | Arayampathy sri vada pathra kaali Amman temple | Arayampathy Sri Vada Pathra Kaali Amman Temple | active |
| `01M5W5PR18MB7AR5X19KKD65PY` | Sri Paramanainaar kovil Arayampathy | Sri Paramanainaar Kovil Arayampathy | active |
| `01M5W5PR19DSTJZ6F3MHH37CCE` | Sacred Heart of Jesus Church | Sacred Heart Of Jesus Church | active |
| `01M5W5PR19MQJSZBVP42E5P38D` | Darul Arqam Islamic guidance | Darul Arqam Islamic Guidance | active |
| `01M5W5PR1AQDFSTB2EE2F6ZCWF` | Sri Kandaswamy kovil | Sri Kandaswamy Kovil | active |
| `01M5W5PR1B94MSW0J8F9M962X2` | Jalaliya matgrisa | Jalaliya Matgrisa | active |
| `01M5W5PR1CH97321YB86RFKY0H` | Narasimmar kovil | Narasimmar Kovil | active |
| `01M5W5PR1CQDD56JNVX42090M8` | Hairath Masjith Cemetery kattankudy. | Hairath Masjith Cemetery Kattankudy. | active |
| `01M5W5PR1H5V32QN638ZB41B35` | The legend salon | The Legend Salon | active |
| `01M5W5PR1WCSQQE343R92QSKMB` | Priya Beauty Lab (Pvt) Ltd | Priya Beauty Lab (PVT) Ltd | active |
| `01M5W5PR1X5ATD6WACYJTNB9GY` | Thanu Saree Pre-pleating and Dressing Service | Thanu Saree Pre-Pleating And Dressing Service | active |
| `01M5W5PR1YAVCRJC5ZSR23BC0W` | Salon shine | Salon Shine | active |
| `01M5W5PR1YJAC92ZZS9R92VXPM` | Queen Bee Ladies Salon (Pvt) Ltd and villa | Queen Bee Ladies Salon (PVT) Ltd And Villa | active |
| `01M5W5PR201BWP4QH25HMCH0A6` | Iventhini Bridal & Beauty care | Iventhini Bridal & Beauty Care | active |
| `01M5W5PR20WJCCX0RHGSPAJF77` | Sasikumar home | Sasikumar Home | active |
| `01M5W5PR290DTP1SGXN3T5T17G` | Dusha beauty salon | Dusha Beauty Salon | active |
| `01M5W5PR2NDYERZF2WXKPH9NH0` | Henna and beauty salon kattankudy | Henna And Beauty Salon Kattankudy | active |
| `01M5W5PR2Y3TFPTERTTND8KGWB` | Royal saloon | Royal Saloon | active |
| `01M5W5PR30PCV9HJT4HX49E5ZK` | TK saloon | TK Saloon | active |
| `01M5W5PR3MY9FEP1BVVY1P98AC` | Mohaideen pre school | Mohaideen Pre School | active |
| `01M5W5PR3SVB98NDC288F81YFM` | Huzainiya nursery | Huzainiya Nursery | active |
| `01M5W5PR3WVSKY810AYDQQ5S6J` | Darussalam nursery | Darussalam Nursery | active |
| `01M5W5PR3XJ638NWBFPW9QP0V0` | Zayan ayurveda (pvt) Ltd | Zayan Ayurveda (PVT) Ltd | active |
| `01M5W5PR41KH5PDBKV2TVW1D68` | Markaz,Arabic College and Mosque | Markaz,Arabic College And Mosque | active |
| `01M5W5PR42DPM4WTSGZS9JRY86` | Siva pre School | Siva Pre School | active |
| `01M5W5PR47WT4ZBGN6A5601P53` | Pick Me service | Pick Me Service | active |
| `01M5W5PR75CQA24T79W130QEJY` | Deluxe Lanka Pvt Ltd | Deluxe Lanka PVT Ltd | active |
| `01M5W5PR78YYE392MMG6NMKGBE` | Lotus Villa Rooms kattankudy | Lotus Villa Rooms Kattankudy | active |
| `01M5W5PR7AXBSBWM5PS6T58RR9` | Public library kattankudy | Public Library Kattankudy | active |
| `01M5W5PR7CABVHHE63R6PAVC10` | Rifky Travels and Tours (Pvt) Ltd | Rifky Travels And Tours (PVT) Ltd | active |
| `01M5W5PR7HB72X96GTDV8JF0FY` | Nhk Hardware & Marketing | NHK Hardware & Marketing | active |
| `01M5W5PR7M3R0XQFMA7628D6ZP` | Doha Restaurant and Bake House | Doha Restaurant And Bake House | active |
| `01M5W5PR7QEHG3S8KWJJNS40B5` | anowart Digital Marketing Agency | Anowart Digital Marketing Agency | active |
| `01M5W5PR7TFQYFZZPKEAFKR2XB` | Henna by Hana Kattankudy | Henna By Hana Kattankudy | active |
| `01M5W5PR82Y89RFC5B62A6MNYH` | Fazly's residence | Fazly's Residence | active |
| `01M5W5PR859BDTS3MRR4MFJ7MK` | Seven7digit | Seven7Digit | active |
| `01M5W5PR86Z1PX1Q20EYJ6CZJ6` | Rifky Travels & Tours (Pvt) Ltd | Rifky Travels & Tours (PVT) Ltd | active |
| `01M5W5PR87T49748RKPRMPZP6S` | Mirkaath beef shop | Mirkaath Beef Shop | active |
| `01M5W5PR8B2HE8W0BETN1M8AXP` | Eastern turf indoor cricket and Football | Eastern Turf Indoor Cricket And Football | active |
| `01M5W5PR8EVC00WR2HA6VJK1D0` | Barakaath Book shop & printing | Barakaath Book Shop & Printing | active |
| `01M5W5PR8K7ZQ0P3S0YEE42ET1` | Luqmaan studio & printers | Luqmaan Studio & Printers | active |
| `01M5W5PR8KG9W95VXZ5W30SNKS` | DOT NET (PVT) LTD. (TRAVELS / STUDIO / COMMUNICATION) | Dot Net (PVT) Ltd. (Travels / Studio / Communication) | active |
| `01M5W5PR8N1STE4GJAY7SNW4KY` | Niro photo studio | Niro Photo Studio | active |
| `01M5W5PR8NKATNAEVMWFQ662BR` | FM . STUDIO | FM . Studio | active |
| `01M5W5PR8NN5FVDZV64ASGA9C3` | Mystic Lense photography | Mystic Lense Photography | active |
| `01M5W5PR8PEJRC5T2XY7KWATTB` | Studio focus batti | Studio Focus Batti | active |
| `01M5W5PR8QGFCT92P00NB7DES6` | Ravan photography | Ravan Photography | active |
| `01M5W5PR8QGMC2WA72V9A6J5RY` | KALKI IMAGE STUDIO | Kalki Image Studio | active |
| `01M5W5PR8QKJREM0F0917J5AE9` | Cad studio photography | Cad Studio Photography | active |
| `01M5W5PR8T3FYMQAZF9XKA7P0T` | A1 Editz studio | A1 Editz Studio | active |
| `01M5W5PR8VDJBVZQT53QFT02NF` | Shadow leo studio | Shadow Leo Studio | active |
| `01M5W5PR8VYQ16NN74Y7B47C53` | Studio 7 by Niru | Studio 7 By Niru | active |
| `01M5W5PRA63MRP3WAZEHT72MFT` | Studio 7 by Niru | Studio 7 By Niru | active |
| `01M5W5PRANDQPJ4BM1WZ1HJRMB` | visual voyage studio | Visual Voyage Studio | active |
| `01M5W5PRASK1AF0E9TKF96V2MC` | Craze clicks photography | Craze Clicks Photography | active |
| `01M5W5PRAV3503WTEE1S56ZMAW` | AANA PHOTOGRAPHY | Aana Photography | active |
| `01M5W5PRAVHY5T683XVPKP2A4D` | Doodlers Lk | Doodlers LK | active |
| `01M5W5PRB0T413NV7MNAX3SBFB` | SHALOM DIGITAL STUDIO | Shalom Digital Studio | active |
| `01M5W5PRB61GANMD2QQ9DJTB4B` | Anand yoga studio | Anand Yoga Studio | active |
| `01M5W5PRB666ZG6F0R777A27G6` | ALTHAF GUEST HOUSE&ROOMS | Althaf Guest House&Rooms | active |
| `01M5W5PRB6ZFH4MB5H7R65D8AK` | Kalki digital print | Kalki Digital Print | active |
| `01M5W5PRB8NRYA6PZG4250F9M8` | COLOR CREATION | Color Creation | active |
| `01M5W5PRBNVM20QN9V01RE8WZC` | Aqeel mini supermarket | Aqeel Mini Supermarket | active |
| `01M5W5PRBPKZ2R92E78QEAJEXM` | Hairath grocery shop kattankudy | Hairath Grocery Shop Kattankudy | active |
| `01M5W5PRBW38BHEM7HM57H4X9Q` | Fazul stores | Fazul Stores | active |
| `01M5W5PRBYW7YQS3PT2J0NCKK7` | Vimal store Arayampathy Batticaloa Sri lanka | Vimal Store Arayampathy Batticaloa Sri Lanka | active |
| `01M5W5PRC71JFJ5KXY9W2RBVMV` | Abaya tailoring | Abaya Tailoring | active |
| `01M5W5PRC75TYJ02T4YP251Q19` | Sh ladies tailor | Sh Ladies Tailor | active |
| `01M5W5PRC9492MBPVF9452VQZW` | Reema house | Reema House | active |
| `01M5W5PRCA252EZ66D33W525ZF` | Elite Sofa covers | Elite Sofa Covers | active |
| `01M5W5PRCE1Q5PNEZPKNHTVZF9` | Githion vimala | Githion Vimala | active |
| `01M5W5PRCHNQ6M2HFB6QSJYG8X` | Tailor mohan | Tailor Mohan | active |
| `01M5W5PRCW2J7RNWAG3E1EZ8SD` | Sattar Textiles (Pvt) Ltd | Sattar Textiles (PVT) Ltd | active |
| `01M5W5PRDJQ64P5JQJ71PW9MDP` | New selection (offer shop) main street kattankudy | New Selection (Offer Shop) Main Street Kattankudy | active |
| `01M5W5PRDTFA34VAK0FD7V4T0K` | Great fabric | Great Fabric | active |
| `01M5W5PRE2Q0CK2SXVSW5VMB70` | Cheap multi shop | Cheap Multi Shop | active |
| `01M5W5PRE35F5PCND36F8ZAHZG` | Saree batti textiles | Saree Batti Textiles | active |
| `01M5W5PRF5ANHTA24M9T6XCEYV` | zainy Tex | Zainy Tex | active |
| `01M5W5PRF8J0K1S5JXDSERTKV9` | Nabaviyas textile | Nabaviyas Textile | active |
| `01M5W5PRFEYQ8AP28093ZYR4TN` | SSM Cholukkars and Brothers | SSM Cholukkars And Brothers | active |
| `01M5W5PRFPNJSJGTWFBXBJW4ZE` | Surena Travels Pvt Limited | Surena Travels PVT Limited | active |
| `01M5W5PRFQ57BN26EX5A1Z6XW8` | Dot Net (Pvt) Ltd. (Travels / Studio / Communication) | Dot Net (PVT) Ltd. (Travels / Studio / Communication) | active |
| `01M5W5PRFQEPRWBNA5BXG8TGFS` | Niroshan house | Niroshan House | active |
| `01M5W5PRFRRH0G1WFPWTRT0XCG` | Ayna tours | Ayna Tours | active |
| `01M5W5PRFS56PXXQ4BYZT2XXSM` | Batti. Kallady MotorBike & bicycle Rental Service | Batti. Kallady MotorBike & Bicycle Rental Service | active |
| `01M5W5PRFXX5VZ32EMM7RZ3CGN` | Rajah bus booking centre | Rajah Bus Booking Centre | active |
| `01M5W5PRG1X5PFEBRWFTX4Y94Q` | A-Life Technologies (Pvt) Ltd | A-Life Technologies (PVT) Ltd | active |
| `01M5W5PRG2XNY3ZZARRGWB6ZT1` | Dot Net (Pvt) Ltd. (Travels / Studio / Communication) | Dot Net (PVT) Ltd. (Travels / Studio / Communication) | active |
| `01M5W5PRG33T08B87040PS07C7` | Sevo (Sevo Smart Tech Pvt Ltd) | Sevo (Sevo Smart Tech PVT Ltd) | active |
| `01M5W5PRG3ZFNRNBCAS5TMTFQ2` | Saiakshaya power solutions | Saiakshaya Power Solutions | active |
| `01M5W5PRG42A6RC7GF2XTH1AA4` | Naseela Tiles (Pvt) Ltd | Naseela Tiles (PVT) Ltd | active |
| `01M5W5PRGADFNFPZRKZCZDRB24` | Nietec electrical | Nietec Electrical | active |
| `01M5W5PRGAEEK4KHHP24PKBPHA` | Power supply & Gene Room | Power Supply & Gene Room | active |
| `01M5W5PRGBY9K24RYJD2SD9M3C` | Garbage Dumping and Recycling - Batticaloa | Garbage Dumping And Recycling - Batticaloa | active |

## Review scope and limits

All 867 audit groups were re-evaluated against current field values. Only groups with every non-ID field exactly equal were consolidated. The 172 groups with field differences remain unresolved; co-location alone was not used to merge records.

Records without independently checked public listings are marked unverified/not checked. Search links are leads only. Missing online presence does not label a record invalid. The two ADDAX records have an IDB name/contact match but conflicting address evidence; the source address and pin were preserved.

Kattankudy postcode 30100 is retained as a reference. Conflicting locality/postcode records were not changed. Invalid or missing coordinates, category mismatches, and pin placement require review from a source that was not available for each record.

## Highest review-priority records

| Score | ULID | Name | Flags |
|---:|---|---|---|
| 57 | `01M5W5PQNSPYAXPC3HBHP8NHTW` | Digital Tutors LK (PVT) Ltd. | missing_coordinates, missing_address |
| 57 | `01M5W5PR7ZVASR5S7YVE9KJBJC` | Women Safe Home | missing_coordinates, missing_address |
| 50 | `01M5W5PQGH75GZ83SY6XS6WTYC` | Kattankudy | missing_address, missing_category, no_contact_field, duplicate_candidate |
| 50 | `01M5W5PQJ00AH3CGCTE9XN7S2M` | Kattankudy | missing_address, missing_category, no_contact_field, duplicate_candidate |
| 50 | `01M5W5PQJ1KJE7Y2HGR0HB1N6A` | Kattankudy | missing_address, missing_category, no_contact_field, duplicate_candidate |
| 50 | `01M5W5PQNYDXP61PVM8DQB4FM1` | Kattankudy | missing_address, missing_category, no_contact_field, duplicate_candidate |
| 45 | `01M5W5PQFM6A48MEPVBZRNND4D` | Rr Mobile Kattankudy | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQG2WY8B3E5315QH8Y6M` | Faleel store | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQG7E124DJ61VQXZDYHJ` | Abans Kattankudy | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQH2EGQ5NRKCAFZ87487` | Amana Bank | SBC | Kattankudy beach Road | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQHAR7QTNYRMF363RE6B` | Batti Motor Riders Rent Car | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQHCF1H1AXMST339FCPV` | VIP Lanka Hub Pvt Ltd | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQHDAJG1K5T5J66T3N3X` | Suzuki every rent a car | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQHNRJENPAN001G30CPY` | Heavenly Bakes By Aysha | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQHZTAD2YF7J5B641EK8` | Amana Bank | SBC | Kattankudy beach Road | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQJFRET1N2547AA161KC` | Real Juice Cool Bar | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQJM0DFXZ6CA9TNQ7XB6` | Fast Food Mafia | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQK05QN19VYDVZKGG7A3` | Faleel store | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQMBJ8WKWYN1591MZCW8` | Abans Kattankudy | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQMMY6Q2TFRM4G2EZAYK` | Harnee beauty care & cosmetics | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQMVGX5XXMMW34K13ZVD` | Heavenly Bakes By Aysha | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQP5BDNM1H0V3K9QVYTJ` | Abans Kattankudy | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQPQGV28QEXVMR2J8QGF` | Faleel store | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQQPVGX7TWP847K297RN` | Rooh.lk | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQRERGNW66P49S6RS503` | Faleel store | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQRVMX98XD9ZGWACV2TN` | Amana Bank | SBC | Kattankudy beach Road | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQW11EEPVEREAMPMRQ4K` | Faleel store | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQWA2AHBXJ4GW4TPDYX4` | Rr Mobile Kattankudy | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQWMPP40XWDA6P5K5FP3` | Faleel store | duplicate_candidate, postcode_locality_review |
| 45 | `01M5W5PQY1F3HRCBS69M3RFSCY` | Real Juice Cool Bar | duplicate_candidate, postcode_locality_review |

## Rollback

`data/places/aliases.json` contains complete retired records and original formatting values. Restore with `python scripts/places_cleanup_phase2.py --rollback`.
